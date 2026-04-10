// Use the same version mentioned in your firebaseConfig comment
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCvV_1aCx7kBSj6S5uSkVk2_itP6UVGpX4",
  authDomain: "pfe-25-5852b.firebaseapp.com",
  projectId: "pfe-25-5852b",
  storageBucket: "pfe-25-5852b.firebasestorage.app",
  messagingSenderId: "404747078979",
  appId: "1:404747078979:web:f951d425ad78958e6033f6",
  measurementId: "G-H6RP57TPJZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };