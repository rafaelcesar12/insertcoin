// =============================================
// INSERT COIN — Jogo do Número ("Qual é a Nota?")
// Firestore Helpers — mesmo estilo de firestore.js
// =============================================

import { db } from "./firebase-config.js";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, query, orderBy,
  getDocs, serverTimestamp, increment,
  onSnapshot, runTransaction, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { addXP } from "./firestore.js";

// ── CÓDIGO DE SALA ────────────────────────────

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function drawSecretNumber() {
  return Math.floor(Math.random() * 11); // 0 a 10
}

// ── CRIAR / ENTRAR EM SALA ─────────────────────

/**
 * Cria uma sala. Se squadId for passado, todos os membros do squad
 * já entram automaticamente como jogadores.
 */
export async function createGameRoom(hostUid, hostNickname, squadId = null) {
  const code = generateRoomCode();
  const roomRef = await addDoc(collection(db, "gameRooms"), {
    code,
    status: "lobby",
    hostUid,
    hostNickname,
    currentRoundId: null,
    squadId: squadId || null,
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, "gameRooms", roomRef.id, "players", hostUid), {
    nickname: hostNickname,
    score: 0,
    isHost: true,
    joinedAt: serverTimestamp()
  });

  // Se veio de um squad, adiciona os outros membros automaticamente
  if (squadId) {
    const squadSnap = await getDoc(doc(db, "squads", squadId));
    if (squadSnap.exists()) {
      const squad = squadSnap.data();
      const members = squad.members || [];
      const nicknames = squad.memberNicknames || [];
      for (let i = 0; i < members.length; i++) {
        if (members[i] === hostUid) continue;
        await setDoc(doc(db, "gameRooms", roomRef.id, "players", members[i]), {
          nickname: nicknames[i] || "Jogador",
          score: 0,
          isHost: false,
          joinedAt: serverTimestamp()
        });
      }
    }
  }

  return { roomId: roomRef.id, roomCode: code };
}

/** Entrada manual por código (pra quem não veio de squad) */
export async function joinGameRoomByCode(code, uid, nickname) {
  const q = query(collection(db, "gameRooms"));
  const snap = await getDocs(q);
  const roomDoc = snap.docs.find(d => d.data().code === code.trim().toUpperCase());
  if (!roomDoc) throw new Error("Sala não encontrada.");
  if (roomDoc.data().status !== "lobby") throw new Error("Essa sala já começou.");

  await setDoc(doc(db, "gameRooms", roomDoc.id, "players", uid), {
    nickname,
    score: 0,
    isHost: false,
    joinedAt: serverTimestamp()
  }, { merge: true });

  return { roomId: roomDoc.id, roomCode: roomDoc.data().code };
}

// ── LISTENERS EM TEMPO REAL ────────────────────

export function listenRoom(roomId, callback) {
  return onSnapshot(doc(db, "gameRooms", roomId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function listenPlayers(roomId, callback) {
  const q = query(collection(db, "gameRooms", roomId, "players"), orderBy("joinedAt"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

export function listenRound(roomId, roundId, callback) {
  return onSnapshot(doc(db, "gameRooms", roomId, "rounds", roundId), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function listenQuestions(roomId, roundId, callback) {
  const q = query(
    collection(db, "gameRooms", roomId, "rounds", roundId, "questions"),
    orderBy("orderIndex")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function listenGuesses(roomId, roundId, callback) {
  const q = query(collection(db, "gameRooms", roomId, "rounds", roundId, "guesses"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

// ── RODADAS ─────────────────────────────────────

/** Só o host chama. Sorteia número e define o próximo jogador por rotação. */
export async function startGameRound(roomId, players) {
  if (players.length < 3) throw new Error("Precisa de pelo menos 3 jogadores.");

  const roundsSnap = await getDocs(collection(db, "gameRooms", roomId, "rounds"));
  const roundNumber = roundsSnap.size + 1;
  const drawer = players[(roundNumber - 1) % players.length];
  const secretNumber = drawSecretNumber();

  const roundRef = await addDoc(collection(db, "gameRooms", roomId, "rounds"), {
    roundNumber,
    drawerUid: drawer.uid,
    drawerNickname: drawer.nickname,
    status: "asking",
    createdAt: serverTimestamp()
  });

  // Número fica numa subcoleção separada, protegida por regra de segurança:
  // só o próprio sorteado lê antes da revelação.
  await setDoc(doc(db, "gameRooms", roomId, "rounds", roundRef.id, "secret", "value"), {
    secretNumber
  });

  await updateDoc(doc(db, "gameRooms", roomId), {
    status: "playing",
    currentRoundId: roundRef.id
  });

  return roundRef.id;
}

/** Só quem foi sorteado consegue de fato ler isso (ver regras do Firestore) */
export async function getSecretNumber(roomId, roundId) {
  const snap = await getDoc(doc(db, "gameRooms", roomId, "rounds", roundId, "secret", "value"));
  return snap.exists() ? snap.data().secretNumber : null;
}

export async function askQuestion(roomId, roundId, askerUid, askerNickname, questionText, orderIndex) {
  await addDoc(collection(db, "gameRooms", roomId, "rounds", roundId, "questions"), {
    askerUid,
    askerNickname,
    questionText: questionText.trim(),
    answerText: null,
    orderIndex,
    createdAt: serverTimestamp()
  });
}

export async function answerQuestion(roomId, roundId, questionId, answerText) {
  await updateDoc(doc(db, "gameRooms", roomId, "rounds", roundId, "questions", questionId), {
    answerText: answerText.trim()
  });
}

export async function submitGuess(roomId, roundId, uid, guessNumber) {
  await setDoc(doc(db, "gameRooms", roomId, "rounds", roundId, "guesses", uid), {
    guessNumber,
    pointsAwarded: 0,
    createdAt: serverTimestamp()
  });
}

/**
 * Só o host chama. Calcula pontos e atualiza o placar.
 * OBS: assim como o resto do Insert Coin (XP, squads), essa pontuação
 * é calculada no client — não há Cloud Function validando o resultado.
 * Combina com o nível de confiança já usado no restante do app.
 */
export async function revealRound(roomId, roundId) {
  const secretNumber = await getSecretNumber(roomId, roundId);
  const guessesSnap = await getDocs(collection(db, "gameRooms", roomId, "rounds", roundId, "guesses"));
  const roundSnap = await getDoc(doc(db, "gameRooms", roomId, "rounds", roundId));
  const drawerUid = roundSnap.data().drawerUid;

  const batch = writeBatch(db);
  let ninguemChegouPerto = true;

  guessesSnap.forEach((g) => {
    const diff = Math.abs(g.data().guessNumber - secretNumber);
    const points = diff === 0 ? 3 : diff === 1 ? 1 : 0;
    if (diff <= 1) ninguemChegouPerto = false;

    batch.update(g.ref, { pointsAwarded: points });
    if (points > 0) {
      batch.update(doc(db, "gameRooms", roomId, "players", g.id), {
        score: increment(points)
      });
    }
  });

  if (ninguemChegouPerto && guessesSnap.size > 0) {
    batch.update(doc(db, "gameRooms", roomId, "players", drawerUid), {
      score: increment(2)
    });
  }

  batch.update(doc(db, "gameRooms", roomId, "rounds", roundId), { status: "revealed" });
  await batch.commit();

  return secretNumber;
}

/** Chame depois da revelação, pra dar XP igual o resto do app (post, squad, etc.) */
export async function giveGameXP(uid, amount) {
  return addXP(uid, amount);
}
