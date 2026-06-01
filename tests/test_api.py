import pytest
from backend import database as db

def test_get_projects(client):
    response = client.get("/api/projects")
    assert response.status_code == 200
    data = response.json()
    assert "projects" in data
    assert "Default" in data["projects"]
    assert data["active"] == "Default"

def test_create_and_switch_project_api(client):
    response = client.post("/api/projects/create", json={"project_name": "ApiTestProject"})
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    # Note: creating doesn't switch automatically. To test switch:
    response = client.post("/api/projects/switch", json={"project_name": "ApiTestProject"})
    assert response.status_code == 200
    response = client.get("/api/projects")
    assert response.json()["active"] == "ApiTestProject"

def test_rating_next_empty(client):
    response = client.get("/api/rating/next")
    assert response.status_code == 200
    data = response.json()
    assert "No unrated images" in data.get("message", "")
    assert data.get("unrated_count") == 0

def test_rating_next_with_data(client):
    # Add data to the DB directly
    db.add_new_image("api_test.jpg", "path", "prompt", 0.5, "A cool image")
    
    response = client.get("/api/rating/next")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "image" in data
    assert data["image"]["image_name"] == "api_test.jpg"

def test_rating_submit_api(client):
    db.add_new_image("submit_test.jpg", "path", "prompt", 0.5, "Image to rate")
    
    response = client.post("/api/rating/submit", json={"image_name": "submit_test.jpg", "rating": 9.0})
    assert response.status_code == 200
    assert response.json()["status"] == "success"
    
    rated = db.get_all_rated_images()
    assert len(rated) == 1
    assert rated[0]["image_name"] == "submit_test.jpg"
    assert rated[0]["rating"] == 9.0

def test_stats_api(client):
    db.add_new_image("u1.jpg", "path", "prompt", 0.5, "unrated")
    db.add_new_image("r1.jpg", "path", "prompt", 0.5, "rated")
    db.update_rating("r1.jpg", 5.0)
    
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["rated_count"] == 1
    assert data["unrated_left"] == 1
    assert data["total_count"] == 2
