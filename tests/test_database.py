import pytest
from backend import database as db

def test_add_and_get_unrated(test_project_env):
    # Ensure starting clean
    assert len(db.get_unrated_images()) == 0
    
    db.add_new_image("test1.jpg", "path/to/test1.jpg", "prompt.txt", 0.7, "A test prompt")
    unrated = db.get_unrated_images()
    assert len(unrated) == 1
    assert unrated[0]["image_name"] == "test1.jpg"
    assert unrated[0]["prompt_text"] == "A test prompt"

def test_update_rating(test_project_env):
    db.add_new_image("test2.jpg", "path/to/test2.jpg", "prompt.txt", 0.5, "Another test")
    
    # Should be in unrated initially
    assert len(db.get_unrated_images()) == 1
    assert len(db.get_all_rated_images()) == 0
    
    # Apply a rating
    db.update_rating("test2.jpg", 8.0)
    
    # Should move to rated
    assert len(db.get_unrated_images()) == 0
    rated = db.get_all_rated_images()
    assert len(rated) == 1
    assert rated[0]["image_name"] == "test2.jpg"
    assert rated[0]["rating"] == 8.0


