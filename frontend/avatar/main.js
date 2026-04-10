/* this file has the next tasks working 
      the 3f face is showing in the web app 
         the light is good 
         but ther is somthing wrong insid the face
      emotiond detection from text is working and it apply to face 
         happy
         sad
         angry
         surprised
         normal
      voice intraction iw working but
         the user talk the msg wroting 
         the answer is showing in text but voice is leat
         the avatar start talking (lips moving by appling the shape keys of face and teeth) but it start befor the voice 
         the face is a male but the voice is female 
      memory system it is not really working 
         the data gose to the fire based and it stors the user conversation ( what the user say and that the ai respond)
         but whene the user singin somthing wrong happend it crat now conversation in data baesd even if it i the same user (i am not sur about that)
         so sometimes it remamber sometimes it is not 
         i do not know exactly where is the problem 
*/






// ===== SMOOTH ANIMATION SETUP =====
// Global variables
let currentUtterance = null;
let currentEmotion = null;
let targetIntensity = 0;
let currentIntensity = 0;
const emotionSpeed = 0.1;
const OPENROUTER_API_KEY = "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"; 

const synth = window.speechSynthesis;
let voices = [];
let isSpeaking = false;

// ===== THREE.JS LOADER =====
const loader = new THREE.GLTFLoader();

// ===== LIP SYNC SYSTEM =====
const lipSyncController = {
  faceObject: null,
  teethObject: null,
  
  init(faceModel) {
    // Reset objects
    this.faceObject = null;
    this.teethObject = null;
    
    // Find face and teeth objects with more flexible matching
    faceModel.traverse((child) => {
      if (child.isMesh) {
        const name = child.name.toLowerCase();
        if (name.includes('face') || name.includes('head') || name.includes('skin')) {
          this.faceObject = child;
          console.log('Found face object:', child.name);
        } else if (name.includes('teeth') || name.includes('tooth')) {
          this.teethObject = child;
          console.log('Found teeth object:', child.name);
        }
      }
    });

    if (!this.faceObject) {
      console.error('Could not find face object - using first mesh with morph targets');
      // Fallback: use first mesh with morph targets
      faceModel.traverse(child => {
        if (!this.faceObject && child.isMesh && child.morphTargetInfluences) {
          this.faceObject = child;
          console.log('Using fallback face object:', child.name);
        }
      });
    }

    if (!this.teethObject) console.warn('Could not find teeth object');
  },

  setViseme(viseme, intensity = 1.0) {
    // Apply to face object
    if (this.faceObject && this.faceObject.morphTargetDictionary) {
      const faceDict = this.faceObject.morphTargetDictionary;
      
      // Reset all face morphs
      for (let i = 0; i < this.faceObject.morphTargetInfluences.length; i++) {
        this.faceObject.morphTargetInfluences[i] = 0;
      }
      
      // Apply current viseme
      const faceKey = `Face_${viseme}`;
      if (faceDict[faceKey] !== undefined) {
        this.faceObject.morphTargetInfluences[faceDict[faceKey]] = intensity;
      } else {
        console.warn(`Missing face shape key: ${faceKey} - trying without prefix`);
        // Try without prefix
        if (faceDict[viseme] !== undefined) {
          this.faceObject.morphTargetInfluences[faceDict[viseme]] = intensity;
        } else {
          console.warn(`Could not find shape key for: ${viseme}`);
        }
      }
    }

    // Apply to teeth object if available
    if (this.teethObject && this.teethObject.morphTargetDictionary) {
      const teethDict = this.teethObject.morphTargetDictionary;
      
      // Reset all teeth morphs
      for (let i = 0; i < this.teethObject.morphTargetInfluences.length; i++) {
        this.teethObject.morphTargetInfluences[i] = 0;
      }
      
      // Apply current viseme
      const teethKey = `Teeth_${viseme}`;
      if (teethDict[teethKey] !== undefined) {
        this.teethObject.morphTargetInfluences[teethDict[teethKey]] = intensity;
      } else {
        console.warn(`Missing teeth shape key: ${teethKey} - trying without prefix`);
        // Try without prefix
        if (teethDict[viseme] !== undefined) {
          this.teethObject.morphTargetInfluences[teethDict[viseme]] = intensity;
        }
      }
    }
  },

  getViseme(phoneme) {
    const visemeMap = {
      // Vowels
      'a': 'Ah', 'o': 'Oh', 'u': 'Oh',
      'e': 'Ee', 'i': 'Ee',
      // Consonants
      'f': 'Fv', 'v': 'Fv',
      'm': 'Mb', 'b': 'Mb', 'p': 'Mb',
      'w': 'Oh', 'l': 'Ee', 'r': 'Ee',
      's': 'Ee', 't': 'Ee', 'd': 'Ee',
      // Default
      'default': 'Neutral'
    };
    return visemeMap[phoneme.toLowerCase()] || visemeMap['default'];
  }
};

// Memory system
let MemorySystem;

(async function() {
  try {
    const module = await import('./memory.js');
    MemorySystem = module.MemorySystem;
    console.log("Memory system loaded");
  } catch (e) {
    console.error("Failed to load memory system:", e);
    MemorySystem = {
      saveConversation: () => Promise.resolve(),
      extractFacts: () => Promise.resolve({}),
      updateMemory: () => Promise.resolve(),
      loadMemory: () => Promise.resolve({})
    };
  }
})();

// Main 3D Viewer Application
document.addEventListener('DOMContentLoaded', async () => {
 // Scene setup
  const scene = new THREE.Scene();
  const canvasContainer = document.getElementById('canvas-container');
  const width = canvasContainer.clientWidth;
  const height = canvasContainer.clientHeight;
  
  // Camera setup
  const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  // Renderer setup
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setClearColor(0x000000, 0);
  canvasContainer.appendChild(renderer.domElement);

  // Controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(1, 1, 1).normalize();
  scene.add(directionalLight);

  // Load 3D face model
 // At the top of your file with other variables
let faceModel = null;
// Load 3D face model - UPDATED VERSION
// Modify your existing loader.load() call to look like this:
           
loader.load('men3-shapeKeys.glb', (gltf) => {    //newMan05.glb
  faceModel = gltf.scene;
  scene.add(faceModel);
  
  // Initialize lip sync system
  lipSyncController.init(faceModel);
  
  // Test - makes character say "Hello" on load
  setTimeout(() => {
    lipSyncController.setViseme('Ah');
    setTimeout(() => lipSyncController.setViseme('Ee'), 300);
    setTimeout(() => lipSyncController.setViseme('Neutral'), 600);
  }, 1000);
  
  // Setup debug controls (remove in production)
  //setupDebugControls();
});


  // Texture handling
  function applyTextureToModel(texture) {
    if (!faceModel) return;
    
    texture.flipY = false;
    faceModel.traverse((child) => {
      if (child.isMesh) {
        // Handle both basic and standard materials
        if (child.material.map) {
          child.material.map = texture;
        }
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.needsUpdate = true;
        }
      }
    });
  }

  // Image upload handler
  document.getElementById('texture-upload').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
  
    try {
      const formData = new FormData();
      formData.append("image", file);
  
      const response = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData,
      });
  
      const result = await response.json();
      if (!response.ok) {
        console.error("Upload failed:", result.error);
        alert("Upload failed: " + (result.error || "Unknown error"));
        return;
      }
  
      const processedImage = result.image;
      const imageUrl = 'data:image/jpeg;base64,' + processedImage;

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(imageUrl, function (texture) {
        applyTextureToModel(texture);
      });
    } catch (error) {
      console.error("Error uploading or applying texture:", error);
      alert("Something went wrong. Please check console for details.");
    }
  });
  
  // Text Emotion Detection
  document.getElementById('analyze-text').addEventListener('click', async () => {
    const text = document.getElementById('user-text').value;
    if (!text.trim()) {
      alert('Please enter some text');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/analyze-text', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ text: text })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const result = await response.json();
      document.getElementById('emotion-result').innerHTML = `
        Detected: <strong>${result.emotion}</strong> 
        (${(result.confidence * 100).toFixed(1)}% confidence)
      `;
      
      if (faceModel) {
        applyEmotionToFace(result.emotion, result.confidence);
      }
    } catch (error) {
      console.error('Error analyzing text:', error);
      alert('Error analyzing text. Please try again.');
    }
  });

  // Emotion to face mapping
  function applyEmotionToFace(emotion, confidence) {
    if (!faceModel || confidence === undefined) return;
  
    faceModel.traverse(child => {
      if (child.isMesh && child.morphTargetDictionary) {
        // Reset all morph targets
        if (child.morphTargetInfluences) {
          for (let i = 0; i < child.morphTargetInfluences.length; i++) {
            child.morphTargetInfluences[i] = 0;
          }
        }
  
        // Apply emotion
        const emotionMap = {
          'joy': 'Happy',
          'anger': 'angry', 
          'surprise': 'Suprised',
          'sadness': 'sad',
          'neutral': 'normal'
        };
  
        const shapeKeyName = emotionMap[emotion];
        if (shapeKeyName && child.morphTargetDictionary[shapeKeyName] !== undefined) {
          child.morphTargetInfluences[child.morphTargetDictionary[shapeKeyName]] = confidence;
          console.log(`Applied ${emotion} at ${(confidence*100).toFixed(1)}% intensity`);
        } else {
          console.warn(`Could not find shape key for emotion: ${emotion}`);
        }
      }
    });
  }

  // User ID
  let userId = localStorage.getItem('userId');
  if (!userId) {
      userId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userId', userId);
      console.log("New user ID generated:", userId);
  }

  // AI Response
  async function getAIResponse(userText) {
    try {
      let userMemory = {};
      
      if (window.MemorySystem && typeof MemorySystem === 'object') {
        try {
          await MemorySystem.saveConversation('user', userText);
          const facts = await MemorySystem.extractFacts(userText);
          await MemorySystem.updateMemory(facts);
          userMemory = await MemorySystem.loadMemory();
        } catch (memoryError) {
          console.error("Memory system error:", memoryError);
        }
      }

      const response = await fetch("http://localhost:5000/get-ai-response", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`
        },
        body: JSON.stringify({ 
          text: userText,
          memory: userMemory,
          user_id: userId
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      return data.response || "I didn't get a response.";
    } catch (err) {
      console.error("AI Error:", err);
      return "Sorry, I'm having trouble responding right now.";
    }
  }

  // Speech Recognition
  const startBtn = document.getElementById("startBtn");
  const resultText = document.getElementById("resultText");
  let isListening = false;
  let recognitionActive = false;
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  // Improved speech recognition handling
  startBtn.onclick = () => {
    if (!isListening) {
      try {
        if (!recognitionActive) {
          recognition.start();
          recognitionActive = true;
          isListening = true;
          startBtn.innerText = "Stop 🎤";
          console.log("🎙️ Listening...");
        }
      } catch (e) {
        console.error("Recognition start error:", e);
      }
    } else {
      recognition.stop();
      isListening = false;
      startBtn.innerText = "Start 🎤";
      console.log("🛑 Stopped listening.");
    }
  };

  recognition.onresult = async (event) => {
    let fullTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        fullTranscript += event.results[i][0].transcript + " ";
      }
    }

    if (fullTranscript.trim()) {
      resultText.innerText += `You: ${fullTranscript.trim()}\n`;
      console.log("User said:", fullTranscript.trim());

      try {
        const aiResponse = await getAIResponse(fullTranscript.trim());
        resultText.innerText += `AI: ${aiResponse}\n\n`;
        // Analyze emotion in AI response
try {
  const emotionRes = await fetch("http://localhost:5000/analyze-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: aiResponse })
  });

  if (emotionRes.ok) {
    const emotionResult = await emotionRes.json();
    console.log("AI Emotion:", emotionResult.emotion);

    // Apply emotion to avatar
    if (faceModel) {
      applyEmotionToFace(emotionResult.emotion, emotionResult.confidence);
    }
  } else {
    console.warn("Failed to analyze emotion from AI response");
  }
} catch (emotionErr) {
  console.error("Error during AI emotion detection:", emotionErr);
}

        // Auto-scroll to bottom
        resultText.scrollTop = resultText.scrollHeight;
        
        await speakResponse(aiResponse);
      } catch (err) {
        console.error("Response error:", err);
        resultText.innerText += "AI: Sorry, I encountered an error.\n\n";
      }
    }
  };

  recognition.onerror = (event) => {
    console.error("Recognition error:", event.error);
    const silentErrors = ['no-speech', 'audio-capture'];
    if (!silentErrors.includes(event.error)) {
      alert(`Recognition error: ${event.error}`);
    }
    isListening = false;
    recognitionActive = false;
    startBtn.innerText = "Start 🎤";
  };

  recognition.onend = () => {
    recognitionActive = false;
    if (isListening && !synth.speaking) {
      setTimeout(() => {
        try {
          recognition.start();
          recognitionActive = true;
        } catch (e) {
          console.log("Restart error:", e.message);
        }
      }, 500);
    }
  };

  // Text-to-Speech
  function initVoices() {
    return new Promise((resolve) => {
      function checkVoices() {
        voices = synth.getVoices();
        if (voices.length > 0) {
          console.log("Voices loaded:", voices);
          resolve();
        } else {
          setTimeout(checkVoices, 200);
        }
      }
      checkVoices();
    });
  }

  // IMPROVED SPEAK RESPONSE WITH PER-WORD ANIMATION
  async function speakResponse(text) {
    if (!text || synth.speaking) return;
    
    return new Promise((resolve) => {
      // Cancel any current speech
      if (synth.speaking) synth.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      currentUtterance = utterance;
      
      // Choose a voice
      const preferredVoices = ['Google UK English Male', 'Microsoft David', 'Alex'];
      for (const name of preferredVoices) {
        const voice = voices.find(v => v.name.includes(name));
        if (voice) {
          utterance.voice = voice;
          break;
        }
      }
      
      // Split text into words
      const words = text.split(/\s+/);
      let wordIndex = 0;
      let currentTimeout = null;
      
      // Function to animate a word
      const animateWord = () => {
        if (wordIndex >= words.length) return;
        
        const word = words[wordIndex];
        const firstChar = word.charAt(0).toLowerCase();
        const viseme = lipSyncController.getViseme(firstChar);
        
        // Apply viseme
        lipSyncController.setViseme(viseme, 0.8);
        
        // Calculate word duration (150ms per word + 50ms per character)
        const duration = Math.max(150, 150 + (word.length * 50));
        
        // Schedule next word and reset
        currentTimeout = setTimeout(() => {
          // Reset to neutral
          lipSyncController.setViseme('Neutral', 0.3);
          
          // Move to next word
          wordIndex++;
          if (wordIndex < words.length) {
            setTimeout(animateWord, 100); // Small pause between words
          }
        }, duration);
      };
      
      // Start animation
      animateWord();
      
      // Handle utterance events
      utterance.onstart = () => {
        console.log("Speech started");
      };
      
      utterance.onend = () => {
        clearTimeout(currentTimeout);
        lipSyncController.setViseme('Neutral');
        currentUtterance = null;
        resolve();
        console.log("Speech ended");
      };
      
      utterance.onerror = (event) => {
        clearTimeout(currentTimeout);
        console.error('Speech synthesis error:', event.error);
        lipSyncController.setViseme('Neutral');
        resolve();
      };
      
      synth.speak(utterance);
    });
  }

  // Initialize voices
  initVoices().then(() => {
    console.log("Voices initialized");
  });

  // Debug UI
  function setupLipSyncDebug() {
    const debugPanel = document.createElement('div');
    debugPanel.style.position = 'fixed';
    debugPanel.style.bottom = '10px';
    debugPanel.style.left = '10px';
    debugPanel.style.background = 'rgba(0,0,0,0.7)';
    debugPanel.style.color = 'white';
    debugPanel.style.padding = '10px';
    debugPanel.style.zIndex = '1000';
    debugPanel.style.borderRadius = '5px';
    debugPanel.style.display = 'flex';
    debugPanel.style.flexDirection = 'column';
    debugPanel.style.gap = '5px';
    
    debugPanel.innerHTML = `
      <h4 style="margin:0 0 5px 0; text-align:center;">Lip Sync Debug</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
        <button data-viseme="Ah">Ah</button>
        <button data-viseme="Ee">Ee</button>
        <button data-viseme="Oh">Oh</button>
        <button data-viseme="Fv">Fv</button>
        <button data-viseme="Mb">Mb</button>
        <button data-viseme="Neutral">Reset</button>
      </div>
      <button id="test-phrase" style="margin-top:5px;">Test Phrase</button>
      <button id="test-emotion">Test Emotion</button>
    `;
    
    debugPanel.querySelectorAll('button[data-viseme]').forEach(btn => {
      btn.addEventListener('click', () => {
        lipSyncController.setViseme(btn.dataset.viseme);
      });
    });
    
    debugPanel.querySelector('#test-phrase').addEventListener('click', () => {
      speakResponse("Hello, this is a test of the lip sync system");
    });
    
    debugPanel.querySelector('#test-emotion').addEventListener('click', () => {
      applyEmotionToFace('joy', 0.8);
    });
    
    document.body.appendChild(debugPanel);
  }

  // Helper function to auto-fit camera to object
  function fitCameraToObject(camera, controls, object, offset = 1.5) {
    const boundingBox = new THREE.Box3().setFromObject(object);
    const size = boundingBox.getSize(new THREE.Vector3()).length();
    const center = boundingBox.getCenter(new THREE.Vector3());
    
    // Update camera position
    camera.position.copy(center);
    camera.position.x += size * offset;
    camera.position.y += size * 0.2;
    camera.position.z += size * offset;
    camera.near = size / 100;
    camera.far = size * 100;
    camera.updateProjectionMatrix();
    
    // Update controls
    controls.target.copy(center);
    controls.update();
  }

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    
    // Smooth emotion transition
    currentIntensity += (targetIntensity - currentIntensity) * emotionSpeed;
    
    if (currentEmotion && faceModel) {
      faceModel.traverse(child => {
        if (child.isMesh && child.morphTargetInfluences) {
          for (let i = 0; i < child.morphTargetInfluences.length; i++) {
            child.morphTargetInfluences[i] = 0;
          }
          if (child.morphTargetDictionary[currentEmotion] !== undefined) {
            child.morphTargetInfluences[child.morphTargetDictionary[currentEmotion]] = currentIntensity;
          }
        }
      });
    }
    
    renderer.render(scene, camera);
    controls.update();
  }
  animate();

  // Window resize handler
  window.addEventListener('resize', () => {
    const newWidth = canvasContainer.clientWidth;
    const newHeight = canvasContainer.clientHeight;
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(newWidth, newHeight);
  });
});