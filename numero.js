// =============================================
// INSERT COIN — Qual é a Nota? — Game Logic
// =============================================

import { requireAuth } from "./auth.js";
import { getUserProfile } from "./firestore.js";
import {
  createGameRoom, joinGameRoomByCode,
  listenRoom, listenPlayers, listenRound, listenQuestions, listenGuesses,
  startGameRound, getSecretNumber,
  askQuestion, answerQuestion, submitGuess, revealRound, giveGameXP
} from "./game-firestore.js";
import {
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList ? el.classList.remove("hidden") : (el.style.display = "");
const hide = (el) => el.classList ? el.classList.add("hidden") : (el.style.display = "none");

const user = await requireAuth("index.html");
const profile = await getUserProfile(user.uid);
const myUid = user.uid;
const myNickname = profile?.nickname || "Jogador";

let state = { roomId: null, roomCode: null, isHost: false };
let unsubs = [];
let latestPlayers = [];
let latestRound = null;
let mySecretCache = {}; // roundId -> number

// ── Carregar squads do usuário no seletor ──────
async function loadMySquads() {
  const snap = await getDocs(query(collection(db, "squads"), orderBy("createdAt", "desc"), limit(50)));
  const mySquads = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(s => s.members?.includes(myUid));

  const select = $("squad-select");
  mySquads.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `🛡️ ${s.name} (${s.members.length} membros)`;
    select.appendChild(opt);
  });
}
loadMySquads();

// ── Criar / Entrar ──────────────────────────────
$("btn-create").addEventListener("click", async () => {
  $("entry-error").textContent = "";
  try {
    const squadId = $("squad-select").value || null;
    const { roomId, roomCode } = await createGameRoom(myUid, myNickname, squadId);
    enterRoom(roomId, roomCode, true);
  } catch (e) { $("entry-error").textContent = e.message; }
});

$("btn-join").addEventListener("click", async () => {
  $("entry-error").textContent = "";
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return;
  try {
    const { roomId, roomCode } = await joinGameRoomByCode(code, myUid, myNickname);
    enterRoom(roomId, roomCode, false);
  } catch (e) { $("entry-error").textContent = e.message; }
});

function enterRoom(roomId, roomCode, isHost) {
  state = { roomId, roomCode, isHost };
  hide($("screen-entry"));
  show($("screen-lobby"));
  $("lobby-code").textContent = roomCode;
  subscribeRoom();
}

// ── Realtime ────────────────────────────────────
function subscribeRoom() {
  unsubs.forEach(u => u());
  unsubs = [];

  unsubs.push(listenRoom(state.roomId, (room) => {
    if (!room) return;
    if (room.status === "playing" && room.currentRoundId) {
      hide($("screen-lobby"));
      show($("screen-game"));
      subscribeRound(room.currentRoundId);
    }
  }));

  unsubs.push(listenPlayers(state.roomId, (players) => {
    latestPlayers = players;
    renderLobbyPlayers(players);
    renderScores(players);
    if (latestRound) renderGame(latestRound, players);
  }));
}

let unsubRoundStuff = [];
function subscribeRound(roundId) {
  unsubRoundStuff.forEach(u => u());
  unsubRoundStuff = [];

  unsubRoundStuff.push(listenRound(state.roomId, roundId, async (round) => {
    if (!round) return;
    latestRound = { ...round, questions: latestRound?.questions || [], guesses: latestRound?.guesses || [] };

    const isDrawer = round.drawerUid === myUid;
    if ((isDrawer || round.status === "revealed") && mySecretCache[roundId] === undefined) {
      mySecretCache[roundId] = await getSecretNumber(state.roomId, roundId);
    }
    renderGame(latestRound, latestPlayers);
  }));

  unsubRoundStuff.push(listenQuestions(state.roomId, roundId, (questions) => {
    latestRound = { ...latestRound, questions };
    renderGame(latestRound, latestPlayers);
  }));

  unsubRoundStuff.push(listenGuesses(state.roomId, roundId, (guesses) => {
    latestRound = { ...latestRound, guesses };
    renderGame(latestRound, latestPlayers);
  }));
}

// ── Render: lobby ───────────────────────────────
function renderLobbyPlayers(players) {
  $("lobby-players").innerHTML = players.map(p =>
    `<li>${escHtml(p.nickname)} ${p.isHost ? '<span class="badge-host">HOST</span>' : ''}</li>`
  ).join("");

  if (state.isHost && players.length >= 3) show($("btn-start"));
  else hide($("btn-start"));
}

$("btn-start").addEventListener("click", async () => {
  try { await startGameRound(state.roomId, latestPlayers); }
  catch (e) { alert(e.message); }
});

// ── Render: jogo ────────────────────────────────
function renderScores(players) {
  $("game-scores").innerHTML = players
    .slice().sort((a, b) => b.score - a.score)
    .map(p => `<li>${escHtml(p.nickname)}<span class="score">${p.score} pts</span></li>`).join("");
}

function renderGame(round, players) {
  if (!round || !round.id) return;
  const isDrawer = round.drawerUid === myUid;
  $("game-status").textContent = `Rodada ${round.roundNumber} — sorteado(a): ${round.drawerNickname}`;

  const secret = mySecretCache[round.id];
  if ((isDrawer || round.status === "revealed") && secret !== undefined && secret !== null) {
    show($("drawer-number-box"));
    $("my-secret-number").textContent = round.status === "revealed" ? `${secret} (revelado)` : secret;
  } else {
    hide($("drawer-number-box"));
  }

  const questions = round.questions || [];
  const guesses = round.guesses || [];

  $("questions-area").innerHTML = questions.map(q => `
    <div class="question-block">
      <div class="q">${escHtml(q.askerNickname)} perguntou: ${escHtml(q.questionText)}</div>
      ${q.answerText ? `<div class="a">💬 ${escHtml(q.answerText)}</div>` : '<div class="a" style="color:var(--text-muted)">aguardando resposta...</div>'}
    </div>
  `).join("");

  const myQuestionSent = questions.some(q => q.askerUid === myUid);
  const pendingAnswer = questions.find(q => !q.answerText);

  if (round.status === "asking" && !isDrawer && !myQuestionSent) show($("ask-box"));
  else hide($("ask-box"));

  if (isDrawer && pendingAnswer) {
    show($("answer-box"));
    $("answer-box").dataset.questionId = pendingAnswer.id;
  } else {
    hide($("answer-box"));
  }

  const totalOthers = players.length - 1;
  const allAnswered = questions.length >= totalOthers && questions.every(q => q.answerText);

  if (allAnswered && round.status !== "revealed" && !isDrawer) {
    const alreadyGuessed = guesses.some(g => g.uid === myUid);
    if (!alreadyGuessed) { show($("guess-box")); renderGuessGrid(round.id); }
    else hide($("guess-box"));
  } else {
    hide($("guess-box"));
  }

  if (allAnswered && round.status !== "revealed" && state.isHost) {
    const allGuessed = guesses.length >= totalOthers;
    $("btn-reveal").style.display = allGuessed ? "block" : "none";
  } else {
    $("btn-reveal").style.display = "none";
  }

  $("btn-next-round").style.display = (round.status === "revealed" && state.isHost) ? "block" : "none";
}

function renderGuessGrid(roundId) {
  const grid = $("guess-grid");
  grid.innerHTML = "";
  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.textContent = i;
    btn.addEventListener("click", async () => {
      await submitGuess(state.roomId, roundId, myUid, i);
    });
    grid.appendChild(btn);
  }
}

// ── Ações ───────────────────────────────────────
$("btn-ask").addEventListener("click", async () => {
  const text = $("ask-input").value.trim();
  if (!text || !latestRound?.id) return;
  const orderIndex = (latestRound.questions?.length || 0) + 1;
  await askQuestion(state.roomId, latestRound.id, myUid, myNickname, text, orderIndex);
  $("ask-input").value = "";
});

$("btn-answer").addEventListener("click", async () => {
  const text = $("answer-input").value.trim();
  const questionId = $("answer-box").dataset.questionId;
  if (!text || !questionId || !latestRound?.id) return;
  await answerQuestion(state.roomId, latestRound.id, questionId, text);
  $("answer-input").value = "";
});

$("btn-reveal").addEventListener("click", async () => {
  if (!latestRound?.id) return;
  await revealRound(state.roomId, latestRound.id);
  // pequeno bônus de XP pra quem participou da rodada, igual ao resto do app
  await giveGameXP(myUid, 3).catch(() => {});
});

$("btn-next-round").addEventListener("click", async () => {
  hide($("drawer-number-box"));
  await startGameRound(state.roomId, latestPlayers);
});

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
