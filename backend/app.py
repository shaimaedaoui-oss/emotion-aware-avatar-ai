from flask import Flask, request, jsonify
from flask_cors import CORS
import dlib
#import cv2
#import numpy as np
#from PIL import Image
from io import BytesIO
import base64
import os
import requests
from transformers import pipeline
import firebase_admin
from firebase_admin import credentials, firestore
from functools import wraps  # NEW IMPORT


# === Firebase setup ===
cred = credentials.Certificate("pfe-25-5852b-firebase-adminsdk-fbsvc-2fee97ee5b.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

app = Flask(__name__)
CORS(app)

# === Emotion Classification Model ===
emotion_classifier = pipeline("text-classification", 
    model="j-hartmann/emotion-english-distilroberta-base")

# === OpenRouter Configuration ===
OPENROUTER_API_KEY = "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"
API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL = "mistralai/mistral-small-3.2-24b-instruct:free"

# === NEW HELPER FUNCTIONS ===
@app.route('/extract-facts', methods=['POST'])
def save_conversation(user_id, message, sender="user"):
    try:
        conversation_data = {
            "message": message,
            "sender": sender,
            "timestamp": firestore.SERVER_TIMESTAMP  # Let Firestore set the timestamp
        }
        
        db.collection("users").document(user_id)\
          .collection("conversations").add(conversation_data)
        return True
    except Exception as e:
        print(f"Error saving conversation: {e}")
        return False

def get_user_conversations(user_id, limit=10):
    try:
        conversations_ref = db.collection("users").document(user_id)\
                              .collection("conversations")\
                              .order_by("timestamp", direction=firestore.Query.DESCENDING)\
                              .limit(limit)
        
        docs = conversations_ref.stream()
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        print(f"Error getting conversations: {e}")
        return []

def extract_user_facts(user_id):
    try:
        conversations = get_user_conversations(user_id)
        facts = {}
        
        # Simple fact extraction from conversation history
        for conv in conversations:
            message = conv.get("message", "").lower()
            
            # Extract name if mentioned
            if "my name is" in message:
                facts["name"] = message.split("my name is")[1].split()[0].title()
            
            # Extract likes/dislikes
            if "i like" in message:
                facts.setdefault("likes", [])
                facts["likes"].append(message.split("i like")[1].strip())
            
            if "i don't like" in message or "i dislike" in message:
                facts.setdefault("dislikes", [])
                parts = message.split("i don't like") if "i don't like" in message else message.split("i dislike")
                facts["dislikes"].append(parts[1].strip())
        
        return facts
    except Exception as e:
        print(f"Error extracting facts: {e}")
        return {}

# === NEW MIDDLEWARE ===
def require_user_id(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = request.headers.get('WcngZG4ce5eCyswkg2xYHpVfkFu1') or request.json.get('users')
        if not user_id:
            return jsonify({"error": "User ID required"}), 401
        return f(*args, **kwargs)
    return decorated_function

# === UPDATED AI RESPONSE ENDPOINT ===
@app.route('/get-ai-response', methods=['POST'])
def get_ai_response():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    try:
        data = request.get_json()
        user_input = data.get('text', '')
        user_id = data.get('user_id', 'default_user')
        
        # Save the user's message first
        save_conversation(user_id, user_input, "user")
        
        # Get conversation history and extract facts
        conversations = get_user_conversations(user_id)
        facts = extract_user_facts(user_id)
        
        # Prepare memory context
        memory_context = "\nConversation history:\n"
        memory_context += "\n".join([f"{conv['sender']}: {conv['message']}" 
                                   for conv in reversed(conversations[-5:])])  # Last 5 messages
        
        if facts:
            memory_context += "\n\nKnown facts about user:\n"
            memory_context += "\n".join(f"- {k}: {', '.join(v) if isinstance(v, list) else v}" 
                                      for k, v in facts.items())
        
        # Call OpenRouter
        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": OPENROUTER_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": f"You are a helpful assistant. {memory_context}\n" +
                              "Use known information when relevant."
                },
                {"role": "user", "content": user_input}
            ],
            "temperature": 0.7
        }

        response = requests.post(API_URL, headers=headers, json=payload)
        response.raise_for_status()
        
        reply = response.json()["choices"][0]["message"]["content"]
        
        # Save the AI's response
        save_conversation(user_id, reply, "ai")
        
        return jsonify({
            "response": reply,
            "user_id": user_id,
            "conversation_history": conversations[-5:]  # Return recent history for debugging
        })

    except Exception as e:
        print(f"AI response error: {str(e)}")
        return jsonify({"response": "Sorry, I encountered an error."})

# === NEW FACT EXTRACTION ENDPOINT ===
@app.route('/extract-facts', methods=['POST'])
def extract_facts_endpoint():
    data = request.json
    message = data.get("message", "")
    
    if not message:
        return jsonify({"error": "No message provided"}), 400
    
    try:
        facts = json.loads(extract_facts_from_text(message))
        return jsonify(facts)
    except Exception as e:
        print(f"Fact extraction error: {str(e)}")
        return jsonify({"error": str(e)}), 500

# === EXISTING ENDPOINTS (UNCHANGED) ===
@app.route('/analyze-text', methods=['POST'])
def analyze_text():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400
    
    results = emotion_classifier(data['text'])
    return jsonify({
        'emotion': results[0]['label'],
        'confidence': float(results[0]['score'])
    })

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image uploaded'}), 400

    image_file = request.files['image']
    img = Image.open(image_file).convert('RGB')
    img_np = np.array(img)

    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    faces = detector(gray)

    if len(faces) == 0:
        return jsonify({'error': 'No face detected'}), 400

    landmarks = predictor(gray, faces[0])
    points = np.array([(p.x, p.y) for p in landmarks.parts()])

    src_pts = np.float32([points[36], points[45], points[30]])
    dst_pts = np.float32([[100, 100], [200, 100], [150, 200]])

    M = cv2.getAffineTransform(src_pts, dst_pts)
    aligned_face = cv2.warpAffine(img_np, M, (300, 300))

    _, buffer = cv2.imencode('.jpg', aligned_face)
    img_b64 = base64.b64encode(buffer).decode('utf-8')

    return jsonify({'image': img_b64})

if __name__ == '__main__':
    app.run(debug=True)