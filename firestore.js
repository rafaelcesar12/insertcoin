// =============================================
// INSERT COIN — Firestore Helpers v2
// =============================================

import { db } from "./firebase-config.js";
import {
  doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, orderBy, limit,
  getDocs, serverTimestamp, increment,
  where, arrayUnion, arrayRemove, onSnapshot
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
    city: "",
    state: "",
    country: "",
    socialLinks: { discord: "", steam: "", epic: "", xbox: "", psn: "", twitch: "", youtube: "" },
    xp: 10,
    level: 1,
    badges: [],
    isAdmin: false,
    isOnline: true,
    lastSeen: serverTimestamp(),
    friends: [],
    friendRequests: [],
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

export async function setUserOnline(uid, isOnline) {
  return updateDoc(doc(db, "users", uid), {
    isOnline,
    lastSeen: serverTimestamp()
  });
}

export async function getOnlinePlayers(limitCount = 10) {
  const q = query(
    collection(db, "users"),
    where("isOnline", "==", true),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function searchUsers(term) {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map(d => d.data())
    .filter(u => u.nickname?.toLowerCase().includes(term.toLowerCase()))
    .slice(0, 10);
}

export async function addXP(uid, amount) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const current = snap.data().xp + amount;
  const newLevel = Math.floor(current / 100) + 1;
  return updateDoc(ref, { xp: increment(amount), level: newLevel });
}

// ── AMIGOS ────────────────────────────────────

export async function sendFriendRequest(fromUid, toUid) {
  const toRef = doc(db, "users", toUid);
  return updateDoc(toRef, { friendRequests: arrayUnion(fromUid) });
}

export async function acceptFriendRequest(myUid, fromUid) {
  const myRef   = doc(db, "users", myUid);
  const fromRef = doc(db, "users", fromUid);
  await updateDoc(myRef,   { friends: arrayUnion(fromUid), friendRequests: arrayRemove(fromUid) });
  await updateDoc(fromRef, { friends: arrayUnion(myUid) });
  await addXP(myUid, 5);
  await addXP(fromUid, 5);
}

export async function rejectFriendRequest(myUid, fromUid) {
  return updateDoc(doc(db, "users", myUid), { friendRequests: arrayRemove(fromUid) });
}

export async function removeFriend(myUid, friendUid) {
  await updateDoc(doc(db, "users", myUid),     { friends: arrayRemove(friendUid) });
  await updateDoc(doc(db, "users", friendUid), { friends: arrayRemove(myUid) });
}

export async function getFriends(uid) {
  const profile = await getUserProfile(uid);
  if (!profile?.friends?.length) return [];
  const results = await Promise.all(profile.friends.map(fid => getUserProfile(fid)));
  return results.filter(Boolean);
}

// ── POSTS ─────────────────────────────────────

export async function createPost(authorUid, authorNickname, content, gameTag = "", imageUrl = "") {
  const ref = await addDoc(collection(db, "posts"), {
    authorUid,
    authorNickname,
    content,
    gameTag,
    imageUrl,
    likesCount: 0,
    likedBy: [],
    commentsCount: 0,
    createdAt: serverTimestamp()
  });
  await addXP(authorUid, 5);
  return ref;
}

export async function getRecentPosts(limitCount = 30) {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deletePost(postId, authorUid) {
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().authorUid !== authorUid) throw new Error("Sem permissão");
  return deleteDoc(ref);
}

export async function likePost(postId, uid) {
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const likedBy = snap.data().likedBy || [];
  if (likedBy.includes(uid)) return; // já curtiu
  await updateDoc(ref, { likesCount: increment(1), likedBy: arrayUnion(uid) });
  await addXP(uid, 1);
}

export async function unlikePost(postId, uid) {
  const ref = doc(db, "posts", postId);
  return updateDoc(ref, { likesCount: increment(-1), likedBy: arrayRemove(uid) });
}

// ── COMENTÁRIOS ──────────────────────────────

export async function addComment(postId, authorUid, authorNickname, content) {
  const ref = await addDoc(collection(db, "comments"), {
    postId, authorUid, authorNickname, content, createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "posts", postId), { commentsCount: increment(1) });
  await addXP(authorUid, 2);
  return ref;
}

export async function getComments(postId) {
  const q = query(
    collection(db, "comments"),
    where("postId", "==", postId),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── SQUADS ────────────────────────────────────

export async function createSquad(ownerUid, ownerNickname, data) {
  const ref = await addDoc(collection(db, "squads"), {
    ownerUid,
    ownerNickname,
    name: data.name,
    game: data.game,
    platform: data.platform,
    description: data.description,
    maxPlayers: Number(data.maxPlayers),
    members: [ownerUid],
    memberNicknames: [ownerNickname],
    status: "aberto",
    createdAt: serverTimestamp()
  });
  await addXP(ownerUid, 10);
  return ref;
}

export async function getOpenSquads(limitCount = 20) {
  const q = query(collection(db, "squads"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function joinSquad(squadId, uid, nickname) {
  const ref = doc(db, "squads", squadId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Squad não encontrado");
  const squad = snap.data();
  if (squad.members.includes(uid)) throw new Error("Você já está neste squad");
  if (squad.members.length >= squad.maxPlayers) throw new Error("Squad cheio");
  await updateDoc(ref, {
    members: arrayUnion(uid),
    memberNicknames: arrayUnion(nickname)
  });
  if (squad.members.length + 1 >= squad.maxPlayers) {
    await updateDoc(ref, { status: "cheio" });
  }
  await addXP(uid, 5);
}

export async function leaveSquad(squadId, uid, nickname) {
  const ref = doc(db, "squads", squadId);
  await updateDoc(ref, {
    members: arrayRemove(uid),
    memberNicknames: arrayRemove(nickname),
    status: "aberto"
  });
}

export async function deleteSquad(squadId, ownerUid) {
  const ref = doc(db, "squads", squadId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  if (snap.data().ownerUid !== ownerUid) throw new Error("Sem permissão");
  return deleteDoc(ref);
}

// ── ADMIN ─────────────────────────────────────

export async function getAllUsers(limitCount = 100) {
  const q = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function banUser(uid) {
  return updateDoc(doc(db, "users", uid), { banned: true });
}

export async function unbanUser(uid) {
  return updateDoc(doc(db, "users", uid), { banned: false });
}

export async function setAdmin(uid, isAdmin) {
  return updateDoc(doc(db, "users", uid), { isAdmin });
}

export async function giveXP(uid, amount) {
  return addXP(uid, amount);
}

export async function setUserRole(uid, role) {
  return updateDoc(doc(db, "users", uid), { role });
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

export function calcLevel(xp) {
  return Math.floor((xp || 0) / 100) + 1;
}
