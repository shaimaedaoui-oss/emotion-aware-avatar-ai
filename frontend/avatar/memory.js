// try2/memory.js
import { db, auth } from '../login/firebase-config.js';
import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

export const MemorySystem = {
  async saveConversation(sender, message) {
    try {
      const user = auth.currentUser;
      if (!user) return;
       console.log("Saving to user:", user.uid);
      await addDoc(collection(db, "users", user.uid, "conversations"), {
        sender,
        message,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error("Error saving conversation:", error);
    }
  },

  async extractFacts(message) {
    try {
      const response = await fetch('http://localhost:5000/extract-facts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      return await response.json();
    } catch (error) {
      console.error("Error extracting facts:", error);
      return {};
    }
  },

  async updateMemory(facts) {
    try {
      const user = auth.currentUser;
      if (!user || !facts) return;
       console.log("Saving to user:", user.uid);
      const updates = {};
      for (const [key, value] of Object.entries(facts)) {
        updates[`memory.${key}`] = value;
      }
      
      await updateDoc(doc(db, "users", user.uid), updates);
    } catch (error) {
      console.error("Error updating memory:", error);
    }
  },

  async loadMemory() {
    try {
      const user = auth.currentUser;
      if (!user) return {};
       console.log("Saving to user:", user.uid);
      const docSnap = await getDoc(doc(db, "users", user.uid));
      return docSnap.exists() ? docSnap.data().memory || {} : {};
    } catch (error) {
      console.error("Error loading memory:", error);
      return {};
    }
  }
};