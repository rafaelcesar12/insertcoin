// =============================================
// INSERT COIN — Squads Logic
// =============================================

import { requireAuth, logoutUser } from "./auth.js";
import { getUserProfile, createSquad, getOpenSquads, joinSquad, leaveSquad, deleteSquad } from "./firestore.js";

let currentUser = null;
let userProfile = null;
let allSquads   = [];
let currentFilter = "todos";

const user = await requireAuth("index.html");
currentUser = user;
userProfile = await getUserProfile(user.uid);

loadSquads();

// ── FILTERS ──────────────────────────────────
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderSquads();
  });
});

// ── LOAD SQUADS ───────────────────────────────
async function loadSquads() {
  document.getElementById("squads-loading").style.display = "flex";
  document.getElementById("squads-list").innerHTML = "";
  allSquads = await getOpenSquads(50).catch(() => []);
  document.getElementById("squads-loading").style.display = "none";
  renderSquads();
}

function renderSquads() {
  const list = document.getElementById("squads-list");
  let squads = allSquads;

  if (currentFilter === "aberto") {
    squads = allSquads.filter(s => s.status === "aberto");
  } else if (currentFilter === "meus") {
    squads = allSquads.filter(s => s.members?.includes(currentUser.uid));
  }

  if (!squads.length) {
    list.innerHTML = `<div class="squad-empty"><div style="font-size:40px;margin-bottom:12px;">🛡️</div><p>Nenhum squad encontrado.<br>Crie o seu!</p></div>`;
    return;
  }

  list.innerHTML = "";
  squads.forEach(s => list.appendChild(buildSquadCard(s)));
}

function buildSquadCard(squad) {
  const card = document.createElement("div");
  card.className = "squad-big-card";
  card.id = `squad-${squad.id}`;

  const isMember = squad.members?.includes(currentUser.uid);
  const isOwner  = squad.ownerUid === currentUser.uid;
  const vacancies = squad.maxPlayers - (squad.members?.length || 1);
  const members = squad.memberNicknames || [];

  card.innerHTML = `
    <div class="squad-card-head">
      <div>
        <div class="squad-card-name">🛡️ ${escHtml(squad.name)}</div>
        <div class="squad-card-owner">Criado por ${escHtml(squad.ownerNickname || "?")} · ${escHtml(squad.game)}</div>
      </div>
      <span class="squad-status ${squad.status}">${squad.status.toUpperCase()}</span>
    </div>
    ${squad.description ? `<div class="squad-desc">${escHtml(squad.description)}</div>` : ""}
    <div class="squad-tags">
      <span class="game-tag">${escHtml(squad.game)}</span>
      <span class="platform-badge">${escHtml(squad.platform)}</span>
      <span class="game-tag">${squad.members?.length || 1}/${squad.maxPlayers} jogadores</span>
      ${vacancies > 0 ? `<span style="color:var(--neon-green);font-family:var(--font-mono);font-size:11px;">${vacancies} vaga(s)</span>` : ""}
    </div>
    ${members.length ? `<div class="squad-members">Membros: ${members.map(n => `<span class="member-chip">${escHtml(n)}</span>`).join("")}</div>` : ""}
    <div class="squad-actions">
      ${!isMember && squad.status === "aberto" ? `<button class="btn btn-primary join-btn" data-id="${squad.id}" data-name="${escHtml(squad.name)}" style="padding:8px 16px;font-size:11px;">▶ ENTRAR</button>` : ""}
      ${isMember && !isOwner ? `<button class="btn btn-ghost leave-btn" data-id="${squad.id}" style="padding:8px 16px;font-size:11px;">↩ SAIR</button>` : ""}
      ${isOwner ? `<button class="btn btn-danger delete-squad-btn" data-id="${squad.id}" style="padding:8px 16px;font-size:11px;">🗑️ DELETAR</button>` : ""}
      ${isMember ? `<span style="color:var(--neon-green);font-size:12px;font-family:var(--font-head);padding:8px;">✅ Você está neste squad</span>` : ""}
    </div>`;

  card.querySelector(".join-btn")?.addEventListener("click", async (e) => {
    const id   = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    try {
      await joinSquad(id, currentUser.uid, userProfile?.nickname || "?");
      showToast(`Você entrou no squad ${name}! +5 XP 🛡️`);
      await loadSquads();
    } catch (err) { showToast(err.message, "error"); }
  });

  card.querySelector(".leave-btn")?.addEventListener("click", async (e) => {
    await leaveSquad(e.currentTarget.dataset.id, currentUser.uid, userProfile?.nickname || "?");
    showToast("Você saiu do squad.");
    await loadSquads();
  });

  card.querySelector(".delete-squad-btn")?.addEventListener("click", async (e) => {
    if (!confirm("Deletar este squad?")) return;
    try {
      await deleteSquad(e.currentTarget.dataset.id, currentUser.uid);
      showToast("Squad deletado.");
      await loadSquads();
    } catch (err) { showToast(err.message, "error"); }
  });

  return card;
}

// ── CREATE SQUAD ──────────────────────────────
document.getElementById("btn-create-squad").addEventListener("click", async () => {
  const name     = document.getElementById("sq-name").value.trim();
  const game     = document.getElementById("sq-game").value.trim();
  const platform = document.getElementById("sq-platform").value;
  const maxP     = document.getElementById("sq-max").value;
  const desc     = document.getElementById("sq-desc").value.trim();
  const errEl    = document.getElementById("sq-error");
  errEl.style.display = "none";

  if (!name) return showSqError("Digite o nome do squad.");
  if (!game) return showSqError("Digite o jogo do squad.");

  const btn     = document.getElementById("btn-create-squad");
  const btnText = document.getElementById("sq-btn-text");
  const spinner = document.getElementById("sq-spinner");
  btn.disabled = true; btnText.style.display = "none"; spinner.style.display = "block";

  try {
    await createSquad(currentUser.uid, userProfile?.nickname || "?", { name, game, platform, maxPlayers: maxP, description: desc });
    showToast(`Squad "${name}" criado! +10 XP 🛡️`);
    document.getElementById("sq-name").value = "";
    document.getElementById("sq-game").value = "";
    document.getElementById("sq-desc").value = "";
    await loadSquads();
  } catch (e) {
    showSqError("Erro ao criar squad. Tente novamente.");
  } finally {
    btn.disabled = false; btnText.style.display = "inline"; spinner.style.display = "none";
  }
});

function showSqError(msg) {
  const el = document.getElementById("sq-error");
  el.textContent = msg;
  el.style.display = "block";
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "index.html";
});

function showToast(msg, type = "success") {
  const c = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
