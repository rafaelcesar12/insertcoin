// =============================================
// INSERT COIN — Qual é a Nota? — Firestore Helpers v2
// =============================================

import { db } from "./firebase-config.js";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, query, orderBy,
  getDocs, serverTimestamp, increment,
  onSnapshot, runTransaction, writeBatch, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { addXP } from "./firestore.js";

// ── CONFIG ──────────────────────────────────────
export const TURN_SECONDS = 40;
export const PRESENCE_STALE_MS = 20000; // 20s sem "ping" = considerado offline
export const PRESENCE_PING_MS = 8000;   // manda ping a cada 8s

export const THEMES = [
  "🧑 Vida pessoal",
  "⚽ Copa do Mundo",
  "🏀 Outro esporte"
];

function randomTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function drawSecretNumber() {
  return Math.floor(Math.random() * 11); // 0 a 10
}

function deadlineIn(seconds) {
  return Timestamp.fromMillis(Date.now() + seconds * 1000);
}

// ── CRIAR / ENTRAR EM SALA ─────────────────────

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
    joinedAt: serverTimestamp(),
    lastPing: serverTimestamp()
  });

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
          joinedAt: serverTimestamp(),
          lastPing: serverTimestamp()
        });
      }
    }
  }

  return { roomId: roomRef.id, roomCode: code };
}

export async function joinGameRoomByCode(code, uid, nickname) {
  const snap = await getDocs(query(collection(db, "gameRooms")));
  const roomDoc = snap.docs.find(d => d.data().code === code.trim().toUpperCase());
  if (!roomDoc) throw new Error("Sala não encontrada.");
  if (roomDoc.data().status !== "lobby") throw new Error("Essa sala já começou.");

  const playersSnap = await getDocs(collection(db, "gameRooms", roomDoc.id, "players"));
  const alreadyIn = playersSnap.docs.some(p => p.id === uid);
  if (!alreadyIn && playersSnap.size >= 10) throw new Error("Sala cheia (máximo de 10 jogadores).");

  await setDoc(doc(db, "gameRooms", roomDoc.id, "players", uid), {
    nickname,
    score: 0,
    isHost: false,
    joinedAt: serverTimestamp(),
    lastPing: serverTimestamp()
  }, { merge: true });

  return { roomId: roomDoc.id, roomCode: roomDoc.data().code };
}

// ── PRESENÇA ────────────────────────────────────

export async function sendPresencePing(roomId, uid) {
  await updateDoc(doc(db, "gameRooms", roomId, "players", uid), {
    lastPing: serverTimestamp()
  }).catch(() => {});
}

export function isPlayerOnline(player) {
  if (!player?.lastPing) return false;
  const ms = player.lastPing.toMillis ? player.lastPing.toMillis() : player.lastPing;
  return Date.now() - ms < PRESENCE_STALE_MS;
}

/** Qualquer cliente pode chamar; só o eleito de fato escreve (ver numero.js) */
export async function takeOverHost(roomId, newHostUid, newHostNickname) {
  await updateDoc(doc(db, "gameRooms", roomId), {
    hostUid: newHostUid,
    hostNickname: newHostNickname
  });
}

// ── NOME DENTRO DO JOGO ─────────────────────────

export async function updateMyGameNickname(roomId, uid, nickname) {
  await updateDoc(doc(db, "gameRooms", roomId, "players", uid), {
    nickname: nickname.trim()
  });
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

export function listenGuesses(roomId, roundId, callback) {
  const q = query(collection(db, "gameRooms", roomId, "rounds", roundId, "guesses"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
  });
}

// ── RODADAS ─────────────────────────────────────

/**
 * Sorteia o próximo "sorteado" aleatoriamente (evita repetir o mesmo
 * de imediato quando há mais de 1 jogador), sorteia o número secreto,
 * e monta a ordem de perguntas (embaralhada) dos demais jogadores.
 */
export async function startGameRound(roomId, players, previousDrawerUid = null) {
  const onlinePlayers = players.filter(isPlayerOnline);
  const pool = onlinePlayers.length >= 3 ? onlinePlayers : players;
  if (pool.length < 3) throw new Error("Precisa de pelo menos 3 jogadores online.");

  let candidates = pool;
  if (previousDrawerUid && pool.length > 1) {
    const filtered = pool.filter(p => p.uid !== previousDrawerUid);
    if (filtered.length > 0) candidates = filtered;
  }
  const drawer = candidates[Math.floor(Math.random() * candidates.length)];
  const others = pool.filter(p => p.uid !== drawer.uid);
  const askOrder = shuffle(others).map(p => p.uid);

  const roundsSnap = await getDocs(collection(db, "gameRooms", roomId, "rounds"));
  const roundNumber = roundsSnap.size + 1;
  const secretNumber = drawSecretNumber();

  const roundRef = await addDoc(collection(db, "gameRooms", roomId, "rounds"), {
    roundNumber,
    drawerUid: drawer.uid,
    drawerNickname: drawer.nickname,
    status: "asking",
    askOrder,
    currentQuestionIndex: 1,
    currentAskerUid: askOrder[0],
    theme: randomTheme(),
    phaseDeadline: deadlineIn(TURN_SECONDS),
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, "gameRooms", roomId, "rounds", roundRef.id, "secret", "value"), {
    secretNumber
  });

  await updateDoc(doc(db, "gameRooms", roomId), {
    status: "playing",
    currentRoundId: roundRef.id
  });

  return roundRef.id;
}

export async function getSecretNumber(roomId, roundId) {
  const snap = await getDoc(doc(db, "gameRooms", roomId, "rounds", roundId, "secret", "value"));
  return snap.exists() ? snap.data().secretNumber : null;
}

/**
 * Avança o turno: de "asking" -> "answering", ou de "answering" ->
 * próxima pergunta (asking) ou -> "guessing" se acabaram as perguntas.
 * Protegido por transação: pode ser chamado por qualquer jogador
 * (botão manual ou timeout automático) sem risco de pular 2x.
 */
export async function advanceTurn(roomId, roundId) {
  const roundRef = doc(db, "gameRooms", roomId, "rounds", roundId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(roundRef);
    if (!snap.exists()) return;
    const r = snap.data();

    if (r.status === "asking") {
      tx.update(roundRef, { status: "answering", phaseDeadline: deadlineIn(TURN_SECONDS) });
    } else if (r.status === "answering") {
      const nextIndex = r.currentQuestionIndex + 1;
      if (nextIndex > r.askOrder.length) {
        tx.update(roundRef, { status: "guessing", currentAskerUid: null, theme: null });
      } else {
        tx.update(roundRef, {
          status: "asking",
          currentQuestionIndex: nextIndex,
          currentAskerUid: r.askOrder[nextIndex - 1],
          theme: randomTheme(),
          phaseDeadline: deadlineIn(TURN_SECONDS)
        });
      }
    }
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
 * Regras de pontuação:
 * - Cada jogador que acertar o número exato ganha 1 ponto.
 * - Errar não ganha nem perde ponto.
 * - Quem pegou o número ganha 3 pontos SE TODOS os palpites acertarem.
 */
export async function revealRound(roomId, roundId) {
  const secretNumber = await getSecretNumber(roomId, roundId);
  const guessesSnap = await getDocs(collection(db, "gameRooms", roomId, "rounds", roundId, "guesses"));
  const roundSnap = await getDoc(doc(db, "gameRooms", roomId, "rounds", roundId));
  const drawerUid = roundSnap.data().drawerUid;

  const batch = writeBatch(db);
  let allCorrect = guessesSnap.size > 0;

  guessesSnap.forEach((g) => {
    const correct = g.data().guessNumber === secretNumber;
    if (!correct) allCorrect = false;
    batch.update(g.ref, { pointsAwarded: correct ? 1 : 0 });
    if (correct) {
      batch.update(doc(db, "gameRooms", roomId, "players", g.id), { score: increment(1) });
    }
  });

  if (allCorrect) {
    batch.update(doc(db, "gameRooms", roomId, "players", drawerUid), { score: increment(3) });
  }

  batch.update(doc(db, "gameRooms", roomId, "rounds", roundId), { status: "revealed" });
  await batch.commit();

  return { secretNumber, drawerUid };
}

export async function giveGameXP(uid, amount) {
  return addXP(uid, amount);
}
