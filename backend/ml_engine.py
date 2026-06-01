import numpy as np
import logging
from sentence_transformers import SentenceTransformer
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_predict
from sklearn.metrics import ndcg_score
from sklearn.linear_model import Ridge, LogisticRegression
from sklearn.ensemble import (
    RandomForestRegressor, HistGradientBoostingRegressor, StackingRegressor,
    RandomForestClassifier, HistGradientBoostingClassifier, VotingClassifier
)
from sklearn.svm import SVR, SVC

from .database import get_all_rated_images, get_unrated_images

logger = logging.getLogger(__name__)

# Global state
embedder = None
active_learning_clf = None
TRAINED_MODELS = {}

ML_STATE = {
    'is_trained': False,
    'is_training': False,
    'training_progress': 0,
    'current_step': '',
    'predictions': {},  
    'ranked_models': [],
    'cancel_requested': False
}

import datetime
SYSTEM_LOGS = []

def log_msg(msg):
    timestamp = datetime.datetime.now().strftime("%H:%M:%S")
    level = "INFO"
    if "WARNING" in msg:
        level = "WARNING"
    elif "ERROR" in msg:
        level = "ERROR"
        
    SYSTEM_LOGS.append({
        "time": timestamp,
        "level": level,
        "message": msg
    })
    if len(SYSTEM_LOGS) > 1000:
        SYSTEM_LOGS.pop(0)
    print(f"[{timestamp}] {msg}", flush=True)

def get_ml_status():
    return {
        "is_training": ML_STATE['is_training'],
        "progress": ML_STATE['training_progress'],
        "step": ML_STATE['current_step']
    }

def reset_ml_state():
    global TRAINED_MODELS, active_learning_clf
    TRAINED_MODELS = {}
    active_learning_clf = None
    ML_STATE.update({
        'is_trained': False,
        'is_training': False,
        'training_progress': 0,
        'current_step': '',
        'predictions': {},
        'ranked_models': []
    })

def get_system_logs():
    return SYSTEM_LOGS

def get_classification_threshold():
    import json
    try:
        from . import project_manager
        path = project_manager.get_project_path("inputs.json")
        with open(path, "r") as f:
            data = json.load(f)
            return float(data.get("classification_threshold", 4.0))
    except:
        return 4.0

threshold = get_classification_threshold()
thresh_str = f">={int(threshold)}" if threshold.is_integer() else f">={threshold}"

BASE_MODEL_NAMES = {
    "ensemble_reg": "Regression: CV Ensemble",
    "ridge_reg": "Regression: Ridge",
    "rf_reg": "Regression: Random Forest",
    "svr_reg": "Regression: Support Vector",
    "gb_reg": "Regression: Gradient Boosting",
    "ensemble_clf": f"Classifier ({thresh_str}): Ensemble",
    "lr_clf": f"Classifier ({thresh_str}): Logistic Regression",
    "rf_clf": f"Classifier ({thresh_str}): Random Forest",
    "svc_clf": f"Classifier ({thresh_str}): SVC",
    "gb_clf": f"Classifier ({thresh_str}): Gradient Boosting"
}

def init_ml():
    global embedder
    if embedder is None:
        log_msg("Loading SentenceTransformer model (all-mpnet-base-v2)...")
        embedder = SentenceTransformer('all-mpnet-base-v2')
        log_msg("SentenceTransformer loaded successfully.")

def train_and_evaluate_models():
    ML_STATE['is_training'] = True
    ML_STATE['cancel_requested'] = False
    ML_STATE['training_progress'] = 0
    ML_STATE['current_step'] = "Initializing models..."
    
    try:
        init_ml()
        
        rated_images = get_all_rated_images()
        log_msg(f"Loaded {len(rated_images)} rated images from database.")
        if len(rated_images) < 15:
            log_msg("WARNING: Not enough rated images to train full models (need >=15).")
            return False
            
        texts = [img['prompt_text'] for img in rated_images]
        scores_reg = [float(img['rating']) for img in rated_images]
        image_names = [img['image_name'] for img in rated_images]
        
        X = embedder.encode(texts)
        y_reg = np.array(scores_reg)
        threshold = get_classification_threshold()
        y_clf = (y_reg >= threshold).astype(int)
        
        model_scores = {}
        kf = KFold(n_splits=5, shuffle=True, random_state=42)

        global TRAINED_MODELS
        TRAINED_MODELS = {}
        
        reg_models = {
            "ridge_reg": Ridge(alpha=1.0),
            "rf_reg": RandomForestRegressor(n_estimators=100, random_state=42),
            "svr_reg": SVR(C=1.0, epsilon=0.1),
            "gb_reg": HistGradientBoostingRegressor(early_stopping=True, max_iter=200, random_state=42)
        }
        
        reg_estimators = [(name, model) for name, model in reg_models.items()]
        reg_models["ensemble_reg"] = StackingRegressor(estimators=reg_estimators, final_estimator=Ridge(), cv=5)

        total_models = len(reg_models) + 5
        current_model_idx = 0

        for name, model in reg_models.items():
            if ML_STATE.get('cancel_requested'):
                log_msg("Training cancelled by user.")
                break
                
            current_model_idx += 1
            progress = int((current_model_idx / total_models) * 100)
            ML_STATE['training_progress'] = progress
            ML_STATE['current_step'] = f"Training Regressor: {name}"
            log_msg(f"Training Regressor ({current_model_idx}/{total_models}): {name}...")
            oof_preds = cross_val_predict(model, X, y_reg, cv=kf)
            ndcg = ndcg_score([y_reg], [oof_preds], k=20)
            
            top_20_idx = np.argsort(oof_preds)[-20:][::-1]
            y_true_binary = (y_reg >= np.percentile(y_reg, 80)).astype(int)
            total_good = np.sum(y_true_binary)
                
            hits = np.sum(y_true_binary[top_20_idx])
            precision_20 = hits / 20.0
            recall_20 = hits / total_good if total_good > 0 else 0.0
            
            model_scores[name] = {"ndcg": float(ndcg), "precision_20": float(precision_20), "recall_20": float(recall_20)}
            
            model.fit(X, y_reg)
            predictions = model.predict(X)
            ML_STATE['predictions'][name] = {img: float(score) for img, score in zip(image_names, predictions)}
            
            # Incrementally update rankings
            sorted_models = sorted(model_scores.items(), key=lambda x: x[1]['ndcg'], reverse=True)
            ML_STATE['ranked_models'] = [{"id": k, "name": BASE_MODEL_NAMES[k], **v} for k, v in sorted_models]

        has_diversity = len(set(y_clf)) > 1
        min_class_count = np.min(np.bincount(y_clf)) if has_diversity else 0
        
        TRAINED_MODELS.update(reg_models)
        
        if has_diversity and min_class_count >= 5:
            ML_STATE['current_step'] = "Preparing Classifier Estimators..."
            log_msg("Evaluating Classifier Models...")
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            
            clf_models = {
                "lr_clf": LogisticRegression(class_weight='balanced', max_iter=1000),
                "rf_clf": RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42),
                "svc_clf": SVC(probability=True, class_weight='balanced', random_state=42),
                "gb_clf": HistGradientBoostingClassifier(early_stopping=True, max_iter=200, random_state=42)
            }
            
            clf_estimators = [(name, model) for name, model in clf_models.items()]
            clf_models["ensemble_clf"] = VotingClassifier(estimators=clf_estimators, voting='soft')
            
            TRAINED_MODELS.update(clf_models)

            total_models = current_model_idx + len(clf_models)
            for name, model in clf_models.items():
                if ML_STATE.get('cancel_requested'):
                    log_msg("Training cancelled by user.")
                    break
                    
                current_model_idx += 1
                progress = int((current_model_idx / total_models) * 100)
                ML_STATE['training_progress'] = progress
                ML_STATE['current_step'] = f"Training Classifier: {name}"
                log_msg(f"Training Classifier ({current_model_idx}/{total_models}): {name}...")
                oof_preds = cross_val_predict(model, X, y_clf, cv=skf, method='predict_proba')[:, 1]
                ndcg = ndcg_score([y_reg], [oof_preds], k=20)
                
                top_20_idx = np.argsort(oof_preds)[-20:][::-1]
                y_true_binary = (y_reg >= np.percentile(y_reg, 80)).astype(int)
                total_good = np.sum(y_true_binary)
                    
                hits = np.sum(y_true_binary[top_20_idx])
                precision_20 = hits / 20.0
                recall_20 = hits / total_good if total_good > 0 else 0.0
                
                model_scores[name] = {"ndcg": float(ndcg), "precision_20": float(precision_20), "recall_20": float(recall_20)}
                
                model.fit(X, y_clf)
                predictions = model.predict_proba(X)[:, 1] 
                ML_STATE['predictions'][name] = {img: float(score) for img, score in zip(image_names, predictions)}
                
                # Incrementally update rankings
                sorted_models = sorted(model_scores.items(), key=lambda x: x[1]['ndcg'], reverse=True)
                ML_STATE['ranked_models'] = [{"id": k, "name": BASE_MODEL_NAMES[k], **v} for k, v in sorted_models]
        else:
            log_msg("WARNING: Not enough class diversity for 5-fold classifiers. Skipping classifiers.")
            for name in [k for k in BASE_MODEL_NAMES.keys() if "_clf" in k]:
                ML_STATE['predictions'][name] = {}
                model_scores[name] = 0.0

        sorted_models = sorted(model_scores.items(), key=lambda x: x[1], reverse=True)
        ML_STATE['ranked_models'] = [{"id": k, "name": BASE_MODEL_NAMES[k], "ndcg": v} for k, v in sorted_models]
        
        ML_STATE['current_step'] = "Training complete."
        ML_STATE['training_progress'] = 100
        log_msg("Finished evaluating all ML models.")
        ML_STATE['is_trained'] = True
        
        train_active_learning_classifier(texts, y_clf)
        return True
    finally:
        ML_STATE['is_training'] = False

def train_active_learning_classifier(texts, y_clf):
    global embedder, active_learning_clf
    if len(set(y_clf)) < 2:
        return
    X_train = embedder.encode(texts)
    active_learning_clf = RandomForestClassifier(n_estimators=100, class_weight='balanced', random_state=42)
    active_learning_clf.fit(X_train, y_clf)

def predict_next_best_image():
    import random
    unrated = get_unrated_images()
    if not unrated:
        return None, False
        
    rated = get_all_rated_images()
    if len(rated) < 20 or active_learning_clf is None or embedder is None:
        return random.choice(unrated), False
        
    sample_size = min(50, len(unrated))
    eval_batch = random.sample(unrated, sample_size)
    
    eval_texts = [img['prompt_text'] for img in eval_batch]
    X_eval = embedder.encode(eval_texts)
    
    probs = active_learning_clf.predict_proba(X_eval)[:, 1]
    best_idx = int(np.argmax(probs))
    return eval_batch[best_idx], True
    
def get_model_rankings():
    return ML_STATE['ranked_models']

def get_feed_items(model_name, sort_descending=True, limit=20, sort_by='pred_score'):
    log_msg(f"DEBUG: get_feed_items for {model_name}. predictions keys: {list(ML_STATE['predictions'].keys())}")
    if model_name not in ML_STATE['predictions']:
        log_msg("DEBUG: model_name not in predictions!")
        return []
        
    model_predictions = ML_STATE['predictions'][model_name]
    rated_images = get_all_rated_images()
    
    log_msg(f"DEBUG: found {len(rated_images)} rated images. model_predictions len: {len(model_predictions)}")
    
    items = []
    for img in rated_images:
        img_name = img['image_name']
        if img_name in model_predictions:
            # Need to get relative path cleanly if it points somewhere inside batch_outputs
            path = img['image_path']
            # Try splitting by batch_outputs to get relative path
            if "batch_outputs" in path:
                path = path.split("batch_outputs")[-1].lstrip('/\\')
                
            items.append({
                'image_name': img_name,
                'relative_path': path,
                'prompt_text': img['prompt_text'],
                'temperature': img['temperature'],
                'real_score': img['rating'],
                'pred_score': model_predictions[img_name]
            })
            
    items.sort(key=lambda x: x[sort_by], reverse=sort_descending)
    return items[:limit]
