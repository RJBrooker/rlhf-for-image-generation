import os
import random
import threading
import concurrent.futures
import json
import uuid
import logging
from datetime import datetime
from pydantic import BaseModel, Field

from google import genai
from google.genai import types

from .database import add_new_image
from .ml_engine import embedder, active_learning_clf, init_ml
from . import project_manager

from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

# --- CONFIGURATION FROM ENV ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# --- API SETTINGS ---
IMAGE_MODEL = "gemini-3-pro-image"
TEXT_MODEL = "gemini-2.5-pro"

# --- PYDANTIC SCHEMAS ---
# Removed LLM schemas

# --- GLOBAL STATE ---
GENERATION_STATE = {
    "is_generating": False,
    "current_cost": 0.0,
    "api_calls_made": 0,
    "max_budget": 2.00,
    "max_calls": 50,
    "status_messages": [],
    "recent_images": [],
    "cost_per_image": 0.03
}
state_lock = threading.Lock()

TEXT_TEMPERATURE = 0.7  
IMAGE_RATIO  = "3:4" 
NUMBER_ITEMS = [5, 6, 6, 7, 7, 7, 8, 8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11]

def log_status(msg: str):
    logger.info(msg)
    with state_lock:
        GENERATION_STATE["status_messages"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
        if len(GENERATION_STATE["status_messages"]) > 50:
            GENERATION_STATE["status_messages"].pop(0)

# --- PROMPT GENERATION ---
def create_random_prompt_string(prompt_segments, parameters):
    selected_sections = []
    for segment in prompt_segments:
        if segment and isinstance(segment, list):
            # filter out empty strings
            valid_opts = [s for s in segment if s.strip()]
            if valid_opts:
                selected_sections.append(random.choice(valid_opts))
    
    prompt = " ".join(selected_sections)
    
    import re
    
    def replacer(match):
        full_match = match.group(0)
        param_name = match.group(1)
        quantifier = match.group(2)
        
        if param_name not in parameters or not parameters[param_name]:
            return full_match
            
        valid_groups = [g for g in parameters[param_name] if g and any(v.strip() for v in g)]
        if not valid_groups:
            return full_match
            
        count = 1
        if quantifier:
            q_str = quantifier[1:] # remove leading colon
            if "-" in q_str:
                parts = q_str.split("-")
                try:
                    min_val = int(parts[0])
                    max_val = int(parts[1])
                    if max_val >= min_val:
                        count = random.randint(min_val, max_val)
                except ValueError:
                    pass
            else:
                try:
                    count = int(q_str)
                except ValueError:
                    pass
                    
        num_to_pick = min(count, len(valid_groups))
        chosen_groups = random.sample(valid_groups, num_to_pick)
        
        chosen_versions = []
        for group in chosen_groups:
            valid_versions = [v for v in group if v.strip()]
            if valid_versions:
                chosen_versions.append(random.choice(valid_versions))
                
        if not chosen_versions:
            return full_match
            
        return ", ".join(chosen_versions)

    prompt = re.sub(r'\{([a-zA-Z0-9_]+)(:[0-9-]+)?\}', replacer, prompt)
    
    return prompt

def generate_best_cover(client, img_temperatures, prompt_segments, parameters, index, output_dir, prompts_dir, base_relative_dir, strategy="random", candidates_count=10000):
    import numpy as np
    try:
        with state_lock:
            if GENERATION_STATE["current_cost"] + GENERATION_STATE["cost_per_image"] > GENERATION_STATE["max_budget"]:
                return False
            if GENERATION_STATE["api_calls_made"] >= GENERATION_STATE["max_calls"]:
                return False
            if not GENERATION_STATE["is_generating"]:
                return False
                
            GENERATION_STATE["current_cost"] += GENERATION_STATE["cost_per_image"]
            GENERATION_STATE["api_calls_made"] += 1
            local_calls = GENERATION_STATE["api_calls_made"]

        # 1. Generate candidate prompts
        candidates = []
        for _ in range(candidates_count):
            candidates.append(create_random_prompt_string(prompt_segments, parameters))
            
        # 2. Score candidates
        from backend import ml_engine
        best_prompt = random.choice(candidates)
        best_probability = 50.0

        if strategy == "random" or ml_engine.embedder is None:
            pass
        elif strategy == "active_learning" and ml_engine.active_learning_clf is not None:
            X_candidates = ml_engine.embedder.encode(candidates)
            probs = ml_engine.active_learning_clf.predict_proba(X_candidates)[:, 1]
            best_idx = int(np.argmax(probs))
            best_prompt = candidates[best_idx]
            best_probability = float(probs[best_idx] * 100)
        elif strategy in ml_engine.TRAINED_MODELS:
            model = ml_engine.TRAINED_MODELS[strategy]
            X_candidates = ml_engine.embedder.encode(candidates)
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(X_candidates)[:, 1]
                best_idx = int(np.argmax(probs))
                best_prompt = candidates[best_idx]
                best_probability = float(probs[best_idx] * 100)
            else:
                preds = model.predict(X_candidates)
                best_idx = int(np.argmax(preds))
                best_prompt = candidates[best_idx]
                best_probability = float(preds[best_idx])

        img_temp = random.choice(img_temperatures)

        log_status(f"Image {index:03d} | Top Tier Chance: {best_probability:.1f}% | [Temp: {img_temp}] (Call {local_calls}/{GENERATION_STATE['max_calls']})")
        
        response = client.models.generate_content(
            model=IMAGE_MODEL,
            contents=best_prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                temperature=img_temp,
                image_config=types.ImageConfig(aspect_ratio=IMAGE_RATIO)
            )
        )
        
        image_bytes = response.candidates[0].content.parts[0].inline_data.data
        
        rnd_id = uuid.uuid4().hex.upper()[0:6]
        base_filename = f"cover_variation_{index:03d}_prob{int(best_probability)}_t{img_temp}_{rnd_id}"
        image_filepath = os.path.join(output_dir, f"{base_filename}.jpg")
        prompt_filepath = os.path.join(prompts_dir, f"{base_filename}.txt")
        
        with open(image_filepath, "wb") as f:
            f.write(image_bytes)
            
        with open(prompt_filepath, "w", encoding="utf-8") as f:
            f.write(f"Top Tier Likelihood: {best_probability:.1f}%\n")
            f.write(f"Image Temperature: {img_temp}\n")
            f.write("-" * 40 + "\n")
            f.write(best_prompt)
            
        # Add to database instantly
        rel_image_path = os.path.join(base_relative_dir, "images", f"{base_filename}.jpg")
        add_new_image(
            image_name=f"{base_filename}.jpg",
            image_path=image_filepath,
            prompt_name=f"{base_filename}.txt",
            temperature=str(img_temp),
            prompt_text=best_prompt
        )
        
        with state_lock:
            GENERATION_STATE["recent_images"].insert(0, {
                "image_name": f"{base_filename}.jpg",
                "relative_path": rel_image_path,
                "prompt_text": best_prompt,
                "probability": best_probability,
                "temperature": img_temp
            })
            if len(GENERATION_STATE["recent_images"]) > 18:
                GENERATION_STATE["recent_images"].pop()
            
        return True
        
    except Exception as e:
        log_status(f"❌ Thread Exception on image {index:03d}: {e}")
        with state_lock:
            GENERATION_STATE["current_cost"] -= GENERATION_STATE["cost_per_image"]
        return False

def run_generation_loop(budget: float, max_calls: int, img_temperatures: list, strategy: str = "random", candidates_count: int = 10000):
    try:
        with state_lock:
            GENERATION_STATE["is_generating"] = True
            GENERATION_STATE["max_budget"] = budget
            GENERATION_STATE["max_calls"] = max_calls
            GENERATION_STATE["current_cost"] = 0.0
            GENERATION_STATE["api_calls_made"] = 0
            GENERATION_STATE["status_messages"] = []
            GENERATION_STATE["recent_images"] = []
            
        log_status("Starting generation initialization...")
        init_ml()
        
        run_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_dir = project_manager.get_project_path("batch_outputs")
        run_folder = os.path.join(batch_dir, f"run_{run_timestamp}")
        output_dir = os.path.join(run_folder, "images")
        prompts_dir = os.path.join(run_folder, "prompts")
        
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(prompts_dir, exist_ok=True)
        
        base_relative_dir = f"run_{run_timestamp}"
        
        log_status("Loading local inputs.json...")
        prompt_segments = []
        parameters = {}
        
        try:
            inputs_path = project_manager.get_project_path("inputs.json")
            with open(inputs_path, 'r', encoding='utf-8') as f:
                inputs_data = json.load(f)
                prompt_segments = inputs_data.get("prompt_segments", [])
                parameters = inputs_data.get("parameters", {})
        except FileNotFoundError:
            log_status("inputs.json not found! Please configure inputs in the UI first.")
            return

        if not prompt_segments:
            log_status("Missing prompt_segments in inputs. Aborting.")
            return

        client = genai.Client(api_key=GEMINI_API_KEY)

        max_workers = 5
        tasks = []

        log_status(f"Starting parallel smart generation. Budget: ${budget:.2f}, Max Calls: {max_calls}")

        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            for i in range(1, 1000): 
                with state_lock:
                    if GENERATION_STATE["current_cost"] + GENERATION_STATE["cost_per_image"] > GENERATION_STATE["max_budget"]:
                        break
                    if GENERATION_STATE["api_calls_made"] >= GENERATION_STATE["max_calls"]:
                        break
                    if not GENERATION_STATE["is_generating"]:
                        log_status("Generation stopped by user.")
                        break
                
                tasks.append(executor.submit(
                    generate_best_cover, 
                    client, img_temperatures, prompt_segments, parameters, i, output_dir, prompts_dir, base_relative_dir, strategy, candidates_count
                ))
            
            concurrent.futures.wait(tasks)

        log_status("Generation Finished.")
    except Exception as e:
        log_status(f"CRITICAL ERROR in generation loop: {str(e)}")
    finally:
        with state_lock:
            GENERATION_STATE["is_generating"] = False

def get_generation_status():
    with state_lock:
        return {
            "is_generating": GENERATION_STATE["is_generating"],
            "current_cost": GENERATION_STATE["current_cost"],
            "api_calls_made": GENERATION_STATE["api_calls_made"],
            "max_budget": GENERATION_STATE["max_budget"],
            "max_calls": GENERATION_STATE["max_calls"],
            "messages": GENERATION_STATE["status_messages"][-10:],
            "recent_images": GENERATION_STATE["recent_images"]
        }

def stop_generation():
    with state_lock:
        if GENERATION_STATE["is_generating"]:
            GENERATION_STATE["is_generating"] = False
            return True
        return False
