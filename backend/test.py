import requests

API_KEY = "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"
API_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL_ID = "mistralai/mistral-small-3.2-24b-instruct:free"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

payload = {
    "model": MODEL_ID,
    "messages": [
        {"role": "user", "content": "Hello! How are you?"}
    ],
    "temperature": 0.7
}

response = requests.post(API_URL, headers=headers, json=payload)

print(f"Status Code: {response.status_code}")
print("Response:")
print(response.json())
