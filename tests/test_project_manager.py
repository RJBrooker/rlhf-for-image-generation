import os
import pytest
from backend import project_manager as pm

def test_init_projects(test_project_env):
    """Test that the default project is created upon init."""
    assert os.path.exists(os.path.join(test_project_env, "Default"))
    assert pm.CURRENT_PROJECT == "Default"

def test_create_project(test_project_env):
    success = pm.create_project("NewProject")
    assert success is True
    assert os.path.exists(os.path.join(test_project_env, "NewProject"))
    
    # Try to create again, should fail
    success = pm.create_project("NewProject")
    assert success is False

def test_rename_project(test_project_env):
    pm.create_project("ToRename")
    success, msg = pm.rename_project("ToRename", "Renamed")
    assert success is True
    assert os.path.exists(os.path.join(test_project_env, "Renamed"))
    assert not os.path.exists(os.path.join(test_project_env, "ToRename"))
    
def test_copy_project(test_project_env):
    pm.create_project("Original")
    success, msg = pm.copy_project("Original", "Original-copy")
    assert success is True
    assert os.path.exists(os.path.join(test_project_env, "Original"))
    assert os.path.exists(os.path.join(test_project_env, "Original-copy"))
    
def test_delete_project(test_project_env):
    pm.create_project("ToDelete")
    success, msg = pm.delete_project("ToDelete")
    assert success is True
    assert not os.path.exists(os.path.join(test_project_env, "ToDelete"))
