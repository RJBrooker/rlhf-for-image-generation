import os
import json
import glob
import logging
from threading import Lock

from . import project_manager

logger = logging.getLogger(__name__)

# In-memory store and lock for thread safety
_db_lock = Lock()
_db_cache = None

def flush_cache():
    global _db_cache
    with _db_lock:
        _db_cache = None

def _load_db():
    global _db_cache
    if _db_cache is None:
        data_file = project_manager.get_project_path("data.json")
        if os.path.exists(data_file):
            try:
                with open(data_file, 'r', encoding='utf-8') as f:
                    _db_cache = json.load(f)
            except json.JSONDecodeError:
                _db_cache = {}
        else:
            _db_cache = {}
    return _db_cache

def _save_db():
    data_file = project_manager.get_project_path("data.json")
    temp_file = data_file + ".tmp"
    with open(temp_file, 'w', encoding='utf-8') as f:
        json.dump(_db_cache, f, indent=4, ensure_ascii=False)
    os.replace(temp_file, data_file)

def migrate_from_csv_and_disk():
    with _db_lock:
        data_file = project_manager.get_project_path("data.json")
        os.makedirs(os.path.dirname(data_file), exist_ok=True)
        db = _load_db()
        
        # 1. Read existing CSV into memory (legacy only)
        import csv
        csv_data = {}
        if os.path.exists("classifications.csv") and project_manager.get_active_project() == "Default":
            with open("classifications.csv", 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    csv_data[row['Image Name']] = {
                        'prompt_name': row.get('Prompt File Name', ''),
                        'temperature': row.get('Temperature', 'Unknown'),
                        'prompt_text': row.get('Prompt Text', ''),
                        'rating': int(row['Rating']) if row.get('Rating') and row['Rating'].isdigit() else None
                    }
        
        # 2. Scan batch_outputs for all images
        batch_dir = project_manager.get_project_path("batch_outputs")
        search_pattern = os.path.join(batch_dir, "*", "images", "*.jpg")
        all_image_paths = glob.glob(search_pattern)
        
        for image_path in all_image_paths:
            image_name = os.path.basename(image_path)
            
            if image_name in db:
                continue
                
            if image_name in csv_data:
                data = csv_data[image_name]
                db[image_name] = {
                    'image_name': image_name,
                    'image_path': image_path,
                    'prompt_name': data['prompt_name'],
                    'temperature': data['temperature'],
                    'prompt_text': data['prompt_text'],
                    'rating': data['rating']
                }
            else:
                img_dir = os.path.dirname(image_path)
                run_dir = os.path.dirname(img_dir)
                base_name = os.path.splitext(image_name)[0]
                prompt_path = os.path.join(run_dir, "prompts", f"{base_name}.txt")
                
                temp = "Unknown"
                prompt_text = "Prompt file not found."
                prompt_name = os.path.basename(prompt_path)
                
                if os.path.exists(prompt_path):
                    with open(prompt_path, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                        if len(lines) > 0 and "Temperature:" in lines[0]:
                            temp = lines[0].split(":")[1].strip()
                        if len(lines) > 2:
                            prompt_text = "".join(lines[2:]).strip()
                            
                db[image_name] = {
                    'image_name': image_name,
                    'image_path': image_path,
                    'prompt_name': prompt_name,
                    'temperature': temp,
                    'prompt_text': prompt_text,
                    'rating': None
                }
                
        _save_db()
        logger.info("Migration to data.json complete.")

def add_new_image(image_name, image_path, prompt_name, temperature, prompt_text):
    with _db_lock:
        db = _load_db()
        db[image_name] = {
            'image_name': image_name,
            'image_path': image_path,
            'prompt_name': prompt_name,
            'temperature': temperature,
            'prompt_text': prompt_text,
            'rating': None
        }
        _save_db()

def update_rating(image_name: str, rating: int):
    with _db_lock:
        db = _load_db()
        if image_name in db:
            db[image_name]['rating'] = rating
            _save_db()

def get_stats():
    with _db_lock:
        db = _load_db()
        total = len(db)
        rated = sum(1 for img in db.values() if img['rating'] is not None)
        
        batches = set([os.path.dirname(os.path.dirname(img['image_path'])) for img in db.values()])
        
        return {
            "total_images": total,
            "rated_count": rated,
            "total_batches": len(batches),
            "percent_rated": (rated / total * 100) if total > 0 else 0
        }

def get_unrated_images():
    with _db_lock:
        db = _load_db()
        return [img for img in db.values() if img['rating'] is None]

def get_all_rated_images():
    with _db_lock:
        db = _load_db()
        return [img for img in db.values() if img['rating'] is not None]

def get_all_images():
    with _db_lock:
        db = _load_db()
        return list(db.values())
