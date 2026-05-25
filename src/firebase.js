import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA8oEKREl8C3GtAAmqN9Imzq9z1N-_bhlg",
  authDomain: "rutas-kosherpty.firebaseapp.com",
  projectId: "rutas-kosherpty",
  storageBucket: "rutas-kosherpty.firebasestorage.app",
  messagingSenderId: "449058491310",
  appId: "1:449058491310:web:ff51cf33a036505fc7563f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
