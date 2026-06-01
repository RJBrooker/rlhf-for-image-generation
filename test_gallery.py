import requests
res = requests.get("http://127.0.0.1:8000/api/gallery?model_id=ridge_reg&view=top")
print("GALLERY:", res.status_code, res.text)
