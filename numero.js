// =============================================
// INSERT COIN — Qual é a Nota? — Game Logic v2
// =============================================

import { requireAuth } from "./auth.js";
import { getUserProfile } from "./firestore.js";
import {
  createGameRoom, joinGameRoomByCode,
  listenRoom, listenPlayers, listenRound, listenGuesses,
  startGameRound, advanceTurn, submitGuess, revealRound, giveGameXP,
  sendPresencePing, isPlayerOnline, takeOverHost, updateMyGameNickname,
  getSecretNumber, TURN_SECONDS, PRESENCE_PING_MS
} from "./game-firestore.js";
import {
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const $ = (id) => document.getElementById(id);
const show = (el) => { el.style.display = ""; el.classList.remove("hidden"); };
const hide = (el) => { el.style.display = "none"; el.classList.add("hidden"); };

const user = await requireAuth("index.html");
const profile = await getUserProfile(user.uid);
const myUid = user.uid;
let myNickname = profile?.nickname || "Jogador";

let state = { roomId: null, roomCode: null };
let unsubs = [];
let unsubRoundStuff = [];
let latestPlayers = [];
let latestRoom = null;
let latestRound = null;
let latestGuesses = [];
let previousDrawerUid = null;

let tickInterval = null;
let pingInterval = null;

// ── Squads do usuário ───────────────────────────
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
    enterRoom(roomId, roomCode);
  } catch (e) { $("entry-error").textContent = e.message; }
});

$("btn-join").addEventListener("click", async () => {
  $("entry-error").textContent = "";
  const code = $("join-code").value.trim().toUpperCase();
  if (!code) return;
  try {
    const { roomId, roomCode } = await joinGameRoomByCode(code, myUid, myNickname);
    enterRoom(roomId, roomCode);
  } catch (e) { $("entry-error").textContent = e.message; }
});

function enterRoom(roomId, roomCode) {
  state = { roomId, roomCode };
  hide($("screen-entry"));
  show($("screen-lobby"));
  $("lobby-code").textContent = roomCode;
  subscribeRoom();
  startPresenceLoop();
  startTickLoop();
}

// ── Presença (ping de "estou vivo") ──────────────
function startPresenceLoop() {
  sendPresencePing(state.roomId, myUid);
  pingInterval = setInterval(() => sendPresencePing(state.roomId, myUid), PRESENCE_PING_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sendPresencePing(state.roomId, myUid);
  });
}

// ── Loop de 1s: cronômetro + checagem de host caído + auto-avanço ──
function startTickLoop() {
  tickInterval = setInterval(() => {
    renderTimer();
    checkHostAlive();
    checkTurnTimeout();
  }, 1000);
}

function checkHostAlive() {
  if (!latestRoom || !latestPlayers.length) return;
  const hostPlayer = latestPlayers.find(p => p.uid === latestRoom.hostUid);
  if (hostPlayer && isPlayerOnline(hostPlayer)) return; // host tá vivo

  // Host sumiu: o jogador online mais antigo (exceto o host) assume
  const onlineOthers = latestPlayers.filter(p => p.uid !== latestRoom.hostUid && isPlayerOnline(p));
  if (!onlineOthers.length) return;
  const nextHost = onlineOthers[0]; // já vem ordenado por joinedAt
  if (nextHost.uid === myUid) {
    takeOverHost(state.roomId, myUid, myNickname).catch(() => {});
  }
}

function checkTurnTimeout() {
  if (!latestRound?.id || !latestRound.phaseDeadline) return;
  if (latestRound.status !== "asking" && latestRound.status !== "answering") return;
  const deadlineMs = latestRound.phaseDeadline.toMillis ? latestRound.phaseDeadline.toMillis() : latestRound.phaseDeadline;
  if (Date.now() >= deadlineMs) {
    advanceTurn(state.roomId, latestRound.id).catch(() => {});
  }
}

// ── Realtime ────────────────────────────────────
function subscribeRoom() {
  unsubs.forEach(u => u());
  unsubs = [];

  unsubs.push(listenRoom(state.roomId, (room) => {
    if (!room) return;
    latestRoom = room;
    if (room.status === "playing" && room.currentRoundId) {
      hide($("screen-lobby"));
      show($("screen-game"));
      if (!unsubRoundStuff.length || latestRound?.id !== room.currentRoundId) {
        subscribeRound(room.currentRoundId);
      }
    }
  }));

  unsubs.push(listenPlayers(state.roomId, (players) => {
    latestPlayers = players;
    const me = players.find(p => p.uid === myUid);
    if (me?.nickname) myNickname = me.nickname;
    renderLobbyPlayers(players);
    renderScores(players);
    if (latestRound) renderGame();
  }));
}

function subscribeRound(roundId) {
  unsubRoundStuff.forEach(u => u());
  unsubRoundStuff = [];

  unsubRoundStuff.push(listenRound(state.roomId, roundId, (round) => {
    if (!round) return;
    if (latestRound?.status === "revealed" && round.id !== latestRound.id) {
      previousDrawerUid = latestRound.drawerUid;
    }
    latestRound = round;
    renderGame();
  }));

  unsubRoundStuff.push(listenGuesses(state.roomId, roundId, (guesses) => {
    latestGuesses = guesses;
    renderGame();
  }));
}

// ── Render: lobby ───────────────────────────────
function renderLobbyPlayers(players) {
  $("lobby-players").innerHTML = players.map(p => `
    <li>
      <span>${escHtml(p.nickname)} ${p.isHost ? '<span class="badge-host">HOST</span>' : ''} ${isPlayerOnline(p) ? '' : '<span class="badge-off">offline</span>'}</span>
      ${p.uid === myUid ? '<button class="btn btn-ghost btn-edit-name" style="padding:2px 8px;font-size:10px;">✏️ nome</button>' : ''}
    </li>
  `).join("");

  $("lobby-players").querySelectorAll(".btn-edit-name").forEach(btn => {
    btn.addEventListener("click", promptRename);
  });

  if (players.length >= 3) show($("btn-start"));
  else hide($("btn-start"));

  const iAmHost = latestRoom?.hostUid === myUid;
  $("btn-start").style.display = (players.length >= 3 && iAmHost) ? "block" : "none";
  $("lobby-wait").style.display = iAmHost ? "none" : "block";
}

async function promptRename() {
  const novoNome = window.prompt("Seu nome neste jogo:", myNickname);
  if (!novoNome || !novoNome.trim()) return;
  myNickname = novoNome.trim();
  await updateMyGameNickname(state.roomId, myUid, myNickname);
}

$("btn-start").addEventListener("click", async () => {
  try { await startGameRound(state.roomId, latestPlayers); }
  catch (e) { alert(e.message); }
});

// ── Render: jogo ────────────────────────────────
function renderScores(players) {
  const sorted = players.slice().sort((a, b) => b.score - a.score);
  const medals = ["🥇", "🥈", "🥉"];
  $("game-scores").innerHTML = sorted.map((p, i) => `
    <li>
      <span>${medals[i] || "•"} ${escHtml(p.nickname)} ${isPlayerOnline(p) ? '' : '<span class="badge-off">offline</span>'}</span>
      <span class="score">${p.score} pts</span>
    </li>
  `).join("");
}

function renderTimer() {
  if (!latestRound?.phaseDeadline) { $("turn-timer").textContent = ""; return; }
  if (latestRound.status !== "asking" && latestRound.status !== "answering") {
    $("turn-timer").textContent = "";
    return;
  }
  const deadlineMs = latestRound.phaseDeadline.toMillis ? latestRound.phaseDeadline.toMillis() : latestRound.phaseDeadline;
  const remaining = Math.max(0, Math.ceil((deadlineMs - Date.now()) / 1000));
  $("turn-timer").textContent = `⏱️ ${remaining}s`;
  $("turn-timer").style.color = remaining <= 10 ? "#ff3355" : "";
}

function renderGame() {
  const round = latestRound;
  if (!round || !round.id) return;
  const isDrawer = round.drawerUid === myUid;
  const isCurrentAsker = round.currentAskerUid === myUid;

  $("game-status").textContent = `Rodada ${round.roundNumber} — sorteado(a): ${round.drawerNickname}`;
  renderTimer();

  // Número secreto
  hide($("drawer-number-box"));
  if (isDrawer && (round.status === "asking" || round.status === "answering")) {
    $("secret-label").textContent = "Seu número secreto:";
    showSecretNumber(round);
  } else if (round.status === "revealed") {
    $("secret-label").textContent = isDrawer ? "Seu número era:" : "Número sorteado:";
    showSecretNumber(round);
  }

  // Fase ASKING
  hide($("theme-box")); hide($("waiting-box")); hide($("answer-turn-box"));
  hide($("guess-box")); hide($("btn-reveal")); hide($("btn-next-round"));

  if (round.status === "asking") {
    if (isCurrentAsker) {
      show($("theme-box"));
      $("theme-text").textContent = round.theme;
      $("theme-sub").textContent = `Pergunte isso pra ${round.drawerNickname}! Você tem ${TURN_SECONDS}s.`;
    } else if (isDrawer) {
      show($("waiting-box"));
      $("waiting-text").textContent = `Aguardando a pergunta de ${nicknameOf(round.currentAskerUid)}...`;
    } else {
      show($("waiting-box"));
      $("waiting-text").textContent = `${nicknameOf(round.currentAskerUid)} está perguntando pra ${round.drawerNickname}...`;
    }
  }

  // Fase ANSWERING
  if (round.status === "answering") {
    if (isDrawer) {
      show($("answer-turn-box"));
      $("answer-turn-text").textContent = `Responda a pergunta de ${nicknameOf(round.currentAskerUid)}!`;
    } else {
      show($("waiting-box"));
      $("waiting-text").textContent = `${round.drawerNickname} está respondendo...`;
    }
  }

  // Botão pular (visível pra todos, só funciona depois do tempo esgotar — reforçado no client)
  const canSkip = round.status === "asking" || round.status === "answering";
  $("btn-skip").style.display = canSkip ? "inline-block" : "none";

  // Fase GUESSING
  if (round.status === "guessing") {
    if (!isDrawer) {
      const already = latestGuesses.some(g => g.uid === myUid);
      if (!already) {
        show($("guess-box"));
        renderGuessGrid(round.id);
      } else {
        show($("waiting-box"));
        $("waiting-text").textContent = "Palpite enviado! Aguardando os outros...";
      }
    } else {
      show($("waiting-box"));
      $("waiting-text").textContent = "Aguardando os palpites da galera...";
    }

    const onlineOthers = latestPlayers.filter(p => p.uid !== round.drawerUid && isPlayerOnline(p));
    const allGuessed = onlineOthers.every(p => latestGuesses.some(g => g.uid === p.uid));
    if (allGuessed && latestGuesses.length > 0) show($("btn-reveal"));
  }

  // REVELADO
  if (round.status === "revealed") {
    show($("btn-next-round"));
  }
}

let cachedSecret = {};
async function showSecretNumber(round) {
  if (cachedSecret[round.id] !== undefined) {
    show($("drawer-number-box"));
    $("my-secret-number").textContent = cachedSecret[round.id];
    return;
  }
  try {
    const n = await getSecretNumber(state.roomId, round.id);
    cachedSecret[round.id] = n;
    show($("drawer-number-box"));
    $("my-secret-number").textContent = n;
  } catch (e) {
    // ainda sem permissão de leitura (não é o sorteado e a rodada não foi revelada) — normal
  }
}

function nicknameOf(uid) {
  return latestPlayers.find(p => p.uid === uid)?.nickname || "alguém";
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
$("btn-skip").addEventListener("click", async () => {
  if (!latestRound?.id) return;
  const deadlineMs = latestRound.phaseDeadline?.toMillis ? latestRound.phaseDeadline.toMillis() : 0;
  if (Date.now() < deadlineMs) {
    if (!confirm("O tempo ainda não acabou. Pular mesmo assim?")) return;
  }
  await advanceTurn(state.roomId, latestRound.id);
});

$("btn-reveal").addEventListener("click", async () => {
  if (!latestRound?.id) return;
  await revealRound(state.roomId, latestRound.id);
  await giveGameXP(myUid, 3).catch(() => {});
});

$("btn-next-round").addEventListener("click", async () => {
  cachedSecret = {};
  hide($("drawer-number-box"));
  try {
    await startGameRound(state.roomId, latestPlayers, latestRound?.drawerUid);
  } catch (e) { alert(e.message); }
});

window.addEventListener("beforeunload", () => {
  clearInterval(tickInterval);
  clearInterval(pingInterval);
});

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
