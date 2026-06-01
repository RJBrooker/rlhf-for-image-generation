import os
import shutil
import logging

logger = logging.getLogger(__name__)

PROJECTS_DIR = "projects"
DEFAULT_PROJECT = "Default"
CURRENT_PROJECT = DEFAULT_PROJECT

def init_projects():
    """Ensures the projects directory exists and migrates legacy data to the Default project."""
    global CURRENT_PROJECT
    os.makedirs(PROJECTS_DIR, exist_ok=True)
    
    default_path = os.path.join(PROJECTS_DIR, DEFAULT_PROJECT)
    os.makedirs(default_path, exist_ok=True)
    
    # Load last active project
    active_file = os.path.join(PROJECTS_DIR, "active_project.txt")
    if os.path.exists(active_file):
        with open(active_file, "r") as f:
            saved_proj = f.read().strip()
            if os.path.exists(os.path.join(PROJECTS_DIR, saved_proj)):
                CURRENT_PROJECT = saved_proj
    
    # Migrate legacy data
    legacy_data = "backend/data.json"
    if os.path.exists(legacy_data):
        target_data = os.path.join(default_path, "data.json")
        if not os.path.exists(target_data):
            os.rename(legacy_data, target_data)
            logger.info(f"Migrated {legacy_data} to {target_data}")
            
    legacy_inputs = "backend/inputs.json"
    if os.path.exists(legacy_inputs):
        target_inputs = os.path.join(default_path, "inputs.json")
        if not os.path.exists(target_inputs):
            os.rename(legacy_inputs, target_inputs)
            logger.info(f"Migrated {legacy_inputs} to {target_inputs}")
            
    legacy_batch = "batch_outputs"
    if os.path.exists(legacy_batch):
        target_batch = os.path.join(default_path, "batch_outputs")
        if not os.path.exists(target_batch):
            os.rename(legacy_batch, target_batch)
            logger.info(f"Migrated {legacy_batch} to {target_batch}")

def get_active_project():
    global CURRENT_PROJECT
    return CURRENT_PROJECT

def set_active_project(project_name):
    global CURRENT_PROJECT
    if os.path.exists(os.path.join(PROJECTS_DIR, project_name)):
        CURRENT_PROJECT = project_name
        active_file = os.path.join(PROJECTS_DIR, "active_project.txt")
        with open(active_file, "w") as f:
            f.write(project_name)
        return True
    return False

def create_project(project_name):
    # sanitize project name
    import re
    project_name = re.sub(r'[^\w\s-]', '', project_name).strip()
    if not project_name:
        return False
        
    project_path = os.path.join(PROJECTS_DIR, project_name)
    if os.path.exists(project_path):
        return False
        
    os.makedirs(project_path)
    return True

def get_all_projects():
    if not os.path.exists(PROJECTS_DIR):
        return [DEFAULT_PROJECT]
        
    dirs = [d for d in os.listdir(PROJECTS_DIR) if os.path.isdir(os.path.join(PROJECTS_DIR, d))]
    return sorted(dirs)

def get_project_details():
    if not os.path.exists(PROJECTS_DIR):
        return [{"name": DEFAULT_PROJECT, "images": 0, "size": "0 MB"}]
        
    projects = []
    dirs = [d for d in os.listdir(PROJECTS_DIR) if os.path.isdir(os.path.join(PROJECTS_DIR, d))]
    for d in sorted(dirs):
        # Count images in batch_outputs if exists
        image_count = 0
        size_bytes = 0
        project_dir = os.path.join(PROJECTS_DIR, d)
        
        # Calculate size
        for root, _, files in os.walk(project_dir):
            for file in files:
                filepath = os.path.join(root, file)
                try:
                    size_bytes += os.path.getsize(filepath)
                    if file.endswith(".png"):
                        image_count += 1
                except:
                    pass
                    
        size_mb = f"{size_bytes / (1024 * 1024):.1f} MB"
        
        projects.append({
            "name": d,
            "images": image_count,
            "size": size_mb,
            "is_active": d == CURRENT_PROJECT
        })
    return projects

def rename_project(old_name, new_name):
    global CURRENT_PROJECT
    import re
    
    new_name = re.sub(r'[^\w\s-]', '', new_name).strip()
    if not new_name:
        return False, "Invalid new project name."
        
    old_path = os.path.join(PROJECTS_DIR, old_name)
    new_path = os.path.join(PROJECTS_DIR, new_name)
    
    if not os.path.exists(old_path):
        return False, "Project not found."
    if os.path.exists(new_path):
        return False, "A project with that name already exists."
        
    os.rename(old_path, new_path)
    
    # If we renamed the active project, update CURRENT_PROJECT to match
    if old_name == CURRENT_PROJECT:
        CURRENT_PROJECT = new_name
        
    return True, "Success"

def delete_project(name):
    global CURRENT_PROJECT
    
    project_path = os.path.join(PROJECTS_DIR, name)
    if not os.path.exists(project_path):
        return False, "Project not found."
        
    shutil.rmtree(project_path)
    
    # If we deleted the active project, switch to any available or Default
    if name == CURRENT_PROJECT:
        remaining = get_all_projects()
        if not remaining:
            create_project(DEFAULT_PROJECT)
            CURRENT_PROJECT = DEFAULT_PROJECT
        else:
            CURRENT_PROJECT = remaining[0]
            
    return True, "Success"

def copy_project(src_name, dest_name):
    import re
    dest_name = re.sub(r'[^\w\s-]', '', dest_name).strip()
    if not dest_name:
        return False, "Invalid destination project name."
        
    src_path = os.path.join(PROJECTS_DIR, src_name)
    dest_path = os.path.join(PROJECTS_DIR, dest_name)
    
    if not os.path.exists(src_path):
        return False, "Source project not found."
    if os.path.exists(dest_path):
        return False, "A project with that destination name already exists."
        
    try:
        shutil.copytree(src_path, dest_path)
        return True, "Success"
    except Exception as e:
        return False, f"Failed to copy: {str(e)}"

def get_project_path(filename=None):
    base = os.path.join(PROJECTS_DIR, CURRENT_PROJECT)
    if filename:
        return os.path.join(base, filename)
    return base
