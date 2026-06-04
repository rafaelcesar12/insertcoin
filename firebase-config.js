// =============================================
// INSERT COIN — Firebase Configuration
// Substitua os valores abaixo pelas credenciais
// do seu projeto no Firebase Console.
// =============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNDgP0z8hUi1w47tVxkUKMD0Hxq2Psnaw",
  authDomain: "insert-coin-fa696.firebaseapp.com",
  projectId: "insert-coin-fa696",
  storageBucket: "insert-coin-fa696.firebasestorage.app",
  messagingSenderId: "424921539456",
  appId: "1:424921539456:web:fd55f457fad4ffe3d39765"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
