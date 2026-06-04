// =============================================
// INSERT COIN — Auth Helpers
// =============================================

import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/** Cria um usuário com e-mail e senha */
export async function registerUser(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/** Faz login com e-mail e senha */
export async function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/** Faz logout */
export async function logoutUser() {
  return signOut(auth);
}

/** Envia e-mail de redefinição de senha */
export async function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/** Observa mudanças de autenticação */
export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/** Redireciona para login se não autenticado */
export function requireAuth(redirectTo = "index.html") {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        window.location.href = redirectTo;
      } else {
        resolve(user);
      }
    });
  });
}

/** Redireciona para home se já autenticado */
export function redirectIfLoggedIn(redirectTo = "home.html") {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (user) {
        window.location.href = redirectTo;
      } else {
        resolve(null);
      }
    });
  });
}
