from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import json

from backend import database, ml_engine, generator, project_manager

app = FastAPI(title="AI Image Dashboard")

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    project_manager.init_projects()
    database.migrate_from_csv_and_disk()
    # ML Engine loading is lazy, but training takes time. Run in background thread to avoid blocking asyncio loop.
    import threading
    threading.Thread(target=ml_engine.train_and_evaluate_models, daemon=True).start()

# --- API ENDPOINTS ---

@app.get("/api/stats")
async def get_stats():
    return database.get_stats()

class ProjectSwitchRequest(BaseModel):
    project_name: str

@app.get("/api/projects")
async def get_projects():
    return {
        "active": project_manager.get_active_project(),
        "projects": project_manager.get_all_projects(),
        "details": project_manager.get_project_details()
    }

@app.post("/api/projects/switch")
async def switch_project(req: ProjectSwitchRequest, background_tasks: BackgroundTasks):
    if project_manager.get_active_project() == req.project_name:
        return {"status": "success"}
        
    success = project_manager.set_active_project(req.project_name)
    if not success:
        return {"status": "error", "message": "Project not found"}
        
    database.flush_cache()
    database.migrate_from_csv_and_disk()
    ml_engine.reset_ml_state()
    background_tasks.add_task(ml_engine.train_and_evaluate_models)
    
    return {"status": "success"}

class ProjectCreateRequest(BaseModel):
    project_name: str

@app.post("/api/projects/create")
async def create_project(req: ProjectCreateRequest):
    success = project_manager.create_project(req.project_name)
    if not success:
        return {"status": "error", "message": "Failed or exists"}
    return {"status": "success"}

class ProjectRenameRequest(BaseModel):
    old_name: str
    new_name: str

@app.post("/api/projects/rename")
async def rename_project(req: ProjectRenameRequest):
    success, msg = project_manager.rename_project(req.old_name, req.new_name)
    if not success:
        return {"status": "error", "message": msg}
    return {"status": "success"}

class ProjectDeleteRequest(BaseModel):
    project_name: str

@app.post("/api/projects/delete")
async def delete_project(req: ProjectDeleteRequest):
    success, msg = project_manager.delete_project(req.project_name)
    if not success:
        return {"status": "error", "message": msg}
    return {"status": "success"}

class ProjectCopyRequest(BaseModel):
    src_name: str
    dest_name: str

@app.post("/api/projects/copy")
async def copy_project(req: ProjectCopyRequest):
    success, msg = project_manager.copy_project(req.src_name, req.dest_name)
    if not success:
        return {"status": "error", "message": msg}
    return {"status": "success"}

class GenerationRequest(BaseModel):
    budget: float
    max_calls: int
    temperatures: list[float]
    strategy: str = "random"
    candidates_count: int = 10000

@app.post("/api/generate/start")
async def start_generation(req: GenerationRequest, background_tasks: BackgroundTasks):
    if generator.get_generation_status()["is_generating"]:
        return {"status": "error", "message": "Already generating"}
        
    background_tasks.add_task(generator.run_generation_loop, req.budget, req.max_calls, req.temperatures, req.strategy, req.candidates_count)
    return {"status": "success", "message": "Generation started"}

@app.post("/api/generate/stop")
async def stop_generation():
    success = generator.stop_generation()
    return {"status": "success" if success else "error"}

@app.get("/api/generate/status")
async def get_generation_status():
    return generator.get_generation_status()

@app.get("/api/rating/next")
async def get_next_image():
    from backend import database
    unrated_count = len(database.get_unrated_images())
    
    img, is_ai = ml_engine.predict_next_best_image()
    if img is None:
        return {"status": "done", "message": "No unrated images", "unrated_count": 0}
    
    # img is a dict from database.py
    return {
        "status": "success",
        "image": img,
        "is_ai_selected": is_ai,
        "unrated_count": unrated_count
    }

class RatingRequest(BaseModel):
    image_name: str
    rating: int

@app.post("/api/rating/submit")
async def submit_rating(req: RatingRequest):
    database.update_rating(req.image_name, req.rating)
    return {"status": "success"}

@app.get("/api/models")
async def get_models():
    return ml_engine.get_model_rankings()

@app.post("/api/models/retrain")
async def retrain_models(background_tasks: BackgroundTasks):
    status = ml_engine.get_ml_status()
    if status.get("is_training"):
        return {"status": "error", "message": "Already training"}
        
    background_tasks.add_task(ml_engine.train_and_evaluate_models)
    return {"status": "success", "message": "Retraining started in background"}

@app.post("/api/models/stop")
async def stop_retraining():
    if not ml_engine.ML_STATE.get('is_training'):
        return {"status": "error", "message": "Not currently training"}
    ml_engine.ML_STATE['cancel_requested'] = True
    return {"status": "success", "message": "Stop requested"}

@app.get("/api/models/status")
async def get_models_status():
    return ml_engine.get_ml_status()

@app.get("/api/logs")
async def get_logs():
    return {"logs": ml_engine.get_system_logs()}

@app.get("/api/gallery")
async def get_gallery(model_id: str = None, view: str = "top"):
    if not model_id:
        rankings = ml_engine.get_model_rankings()
        if rankings:
            model_id = rankings[0]['id']
            
    if not model_id:
        return {"items": []}
        
    if view == "all":
        items = ml_engine.get_feed_items(model_id, sort_descending=True, sort_by='pred_score', limit=9999)
    elif view == "top":
        items = ml_engine.get_feed_items(model_id, sort_descending=True, sort_by='pred_score', limit=20)
    elif view == "bottom":
        items = ml_engine.get_feed_items(model_id, sort_descending=False, sort_by='pred_score', limit=20)
    elif view == "actual_top":
        items = ml_engine.get_feed_items(model_id, sort_descending=True, sort_by='real_score', limit=20)
    elif view == "actual_bottom":
        items = ml_engine.get_feed_items(model_id, sort_descending=False, sort_by='real_score', limit=20)
    else:
        items = ml_engine.get_feed_items(model_id, sort_descending=True, limit=20)
    
    return {"items": items}

@app.get("/images/{filename:path}")
async def serve_image(filename: str):
    file_path = project_manager.get_project_path(os.path.join("batch_outputs", filename))
    if os.path.exists(file_path):
        return FileResponse(file_path)
    return {"status": "error", "message": "File not found"}

class InputsModel(BaseModel):
    prompt_segments: list[list[str]]
    parameters: dict[str, list[list[str]]]
    classification_threshold: float = 4.0

@app.get("/api/inputs")
async def get_inputs():
    try:
        path = project_manager.get_project_path("inputs.json")
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

@app.post("/api/inputs")
async def save_inputs(inputs: InputsModel):
    path = project_manager.get_project_path("inputs.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(inputs.model_dump(), f, indent=2)
    return {"status": "success"}
