import os
import pytest
import shutil
from unittest.mock import patch
from fastapi.testclient import TestClient

from backend.main import app
import backend.project_manager as pm
import backend.database as db
import backend.ml_engine as ml

@pytest.fixture(scope="function")
def test_project_env(tmp_path):
    """
    Creates an isolated projects directory for each test.
    """
    # Create a dummy projects directory inside tmp_path
    test_projects_dir = tmp_path / "test_projects"
    test_projects_dir.mkdir()
    
    # Patch the global PROJECTS_DIR in project_manager
    with patch("backend.project_manager.PROJECTS_DIR", str(test_projects_dir)):
        # Reset the current project to default
        pm.CURRENT_PROJECT = pm.DEFAULT_PROJECT
        pm.init_projects()
        
        # Flush the DB cache so it reads from the new temp directory
        db.flush_cache()
        
        # Reset ML state
        ml.reset_ml_state()
        
        yield str(test_projects_dir)
        
@pytest.fixture(scope="function")
def client(test_project_env):
    """
    Returns a FastAPI TestClient configured to use the isolated project environment.
    """
    with TestClient(app) as c:
        yield c
