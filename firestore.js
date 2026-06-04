// =============================================
// INSERT COIN — Firestore Helpers
// =============================================

import { db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── USUÁRIOS ──────────────────────────────────

export async function createUserProfile(uid, data) {
  return setDoc(doc(db, "users", uid), {
    uid,
    email: data.email,
    nickname: data.nickname,
    mainPlatform: data.mainPlatform,
    favoriteGames: data.favoriteGames,
    bio: "",
    avatarUrl: "",
    bannerUrl: "",
    xp: 10,
    level: 1,
    badges: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserProfile(uid, data) {
  return updateDoc(doc(db, "users", uid), { ...data, updatedAt: serverTimestamp() });
}

export async function addXP(uid, amount) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = snap.data().xp + amount;
  const newLevel = Math.floor(current / 100) + 1;
  return updateDoc(ref, { xp: increment(amount), level: newLevel });
}

// ── POSTS ─────────────────────────────────────

export async function createPost(authorUid, authorNickname, content, gameTag = "") {
  const ref = await addDoc(collection(db, "posts"), {
    authorUid,
    authorNickname,
    content,
    gameTag,
    imageUrl: "",
    likesCount: 0,
    commentsCount: 0,
    createdAt: serverTimestamp()
  });
  await addXP(authorUid, 5);
  return ref;
}

export async function getRecentPosts(limitCount = 20) {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function likePost(postId, uid) {
  const ref = doc(db, "posts", postId);
  await updateDoc(ref, { likesCount: increment(1) });
  await addXP(uid, 1);
}

// ── COMENTÁRIOS ──────────────────────────────

export async function addComment(postId, authorUid, authorNickname, content) {
  const ref = await addDoc(collection(db, "comments"), {
    postId,
    authorUid,
    authorNickname,
    content,
    createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "posts", postId), { commentsCount: increment(1) });
  await addXP(authorUid, 2);
  return ref;
}

// ── SQUADS ────────────────────────────────────

export async function createSquad(ownerUid, data) {
  return addDoc(collection(db, "squads"), {
    ownerUid,
    name: data.name,
    game: data.game,
    platform: data.platform,
    description: data.description,
    maxPlayers: data.maxPlayers,
    members: [ownerUid],
    status: "aberto",
    createdAt: serverTimestamp()
  });
}

export async function getOpenSquads(limitCount = 10) {
  const q = query(collection(db, "squads"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── EVENTOS ───────────────────────────────────

export async function createEvent(ownerUid, data) {
  return addDoc(collection(db, "events"), {
    ownerUid,
    title: data.title,
    game: data.game,
    platform: data.platform,
    description: data.description,
    eventDate: data.eventDate,
    rules: data.rules,
    participants: [ownerUid],
    status: "ativo",
    createdAt: serverTimestamp()
  });
}

export async function getActiveEvents(limitCount = 10) {
  const q = query(collection(db, "events"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ── UTILITÁRIOS ──────────────────────────────

export function formatTimestamp(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return d.toLocaleDateString("pt-BR");
}
