// =============================================
// INSERT COIN — Profile Logic
// =============================================

import { auth } from "./firebase-config.js";
import { requireAuth, logoutUser } from "./auth.js";
import { getUserProfile, updateUserProfile } from "./firestore.js";

let currentUser = null;
let userProfile = null;
let selectedPlatform = "";
const editGames = [];

// ── INIT ─────────────────────────────────────
const user = await requireAuth("index.html");
currentUser = user;
userProfile = await getUserProfile(user.uid);

const loading = document.getElementById("page-loading");
const wrap    = document.getElementById("profile-wrap");
loading.style.display = "none";
wrap.style.display = "flex";

populateProfile();
populateEditForm();

// ── POPULATE PROFILE DISPLAY ──────────────────
function populateProfile() {
  if (!userProfile) return;
  const { nickname, email, mainPlatform, favoriteGames = [], bio = "", xp = 0, level = 1 } = userProfile;

  document.getElementById("p-nick").textContent     = nickname || "—";
  document.getElementById("p-email").textContent    = email || currentUser.email;
  document.getElementById("p-platform").textContent = mainPlatform || "—";
  document.getElementById("p-bio").textContent      = bio || "Sem bio ainda.";
  document.getElementById("p-level").textContent    = level;
  document.getElementById("p-xp").textContent       = xp;
  document.getElementById("p-xp-next").textContent  = level * 100;

  const pct = (xp % 100);
  document.getElementById("p-xp-bar").style.width = `${pct}%`;

  const avatarEl = document.getElementById("p-avatar");
  if (userProfile.avatarUrl) {
    avatarEl.innerHTML = `<img src="${userProfile.avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    avatarEl.textContent = (nickname || "?")[0].toUpperCase();
  }

  const gamesEl = document.getElementById("p-games");
  gamesEl.innerHTML = "";
  if (favoriteGames.length) {
    favoriteGames.forEach(g => {
      const tag = document.createElement("span");
      tag.className = "game-tag";
      tag.textContent = g;
      gamesEl.appendChild(tag);
    });
  } else {
    gamesEl.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">Nenhum jogo cadastrado.</span>`;
  }
}

// ── EDIT FORM ─────────────────────────────────
function populateEditForm() {
  if (!userProfile) return;
  const { nickname, bio = "", mainPlatform = "", favoriteGames = [] } = userProfile;

  document.getElementById("e-nick").value = nickname || "";
  document.getElementById("e-bio").value  = bio || "";

  // Platform
  selectedPlatform = mainPlatform;
  document.querySelectorAll(".platform-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.platform === mainPlatform);
  });

  // Games
  editGames.length = 0;
  document.getElementById("e-games-tags").innerHTML = "";
  favoriteGames.forEach(g => addEditGame(g));
}

// Platform selection
document.querySelectorAll(".platform-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".platform-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedPlatform = btn.dataset.platform;
  });
});

// Games tags
const gameInput = document.getElementById("e-game-input");
const gamesContainer = document.getElementById("e-games-tags");

function addEditGame(name) {
  if (!name || editGames.includes(name) || editGames.length >= 8) return;
  editGames.push(name);
  const tag = document.createElement("span");
  tag.className = "game-tag";
  tag.style.display = "inline-flex";
  tag.style.alignItems = "center";
  tag.style.gap = "4px";
  tag.innerHTML = `${escHtml(name)} <span class="remove-tag" style="cursor:pointer">×</span>`;
  tag.querySelector(".remove-tag").addEventListener("click", () => {
    const idx = editGames.indexOf(name);
    if (idx > -1) editGames.splice(idx, 1);
    tag.remove();
  });
  gamesContainer.appendChild(tag);
}

gameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    addEditGame(gameInput.value.trim());
    gameInput.value = "";
  }
});

// ── SAVE ─────────────────────────────────────
const btnSave    = document.getElementById("btn-save");
const saveText   = document.getElementById("save-text");
const saveSpinner = document.getElementById("save-spinner");
const saveMsg    = document.getElementById("save-msg");

btnSave.addEventListener("click", async () => {
  const nick = document.getElementById("e-nick").value.trim();
  const bio  = document.getElementById("e-bio").value.trim();

  if (!nick || nick.length < 3) {
    showSaveMsg("Nickname deve ter pelo menos 3 caracteres.", false);
    return;
  }

  btnSave.disabled = true;
  saveText.style.display = "none";
  saveSpinner.style.display = "block";
  saveMsg.style.display = "none";

  try {
    await updateUserProfile(currentUser.uid, {
      nickname: nick,
      bio,
      mainPlatform: selectedPlatform,
      favoriteGames: [...editGames]
    });
    userProfile = await getUserProfile(currentUser.uid);
    populateProfile();
    showSaveMsg("Perfil atualizado com sucesso! 🎮", true);
  } catch (e) {
    showSaveMsg("Erro ao salvar. Tente novamente.", false);
    console.error(e);
  } finally {
    btnSave.disabled = false;
    saveText.style.display = "inline";
    saveSpinner.style.display = "none";
  }
});

function showSaveMsg(msg, ok) {
  saveMsg.textContent = msg;
  saveMsg.className = `save-msg ${ok ? "ok" : "err"}`;
  saveMsg.style.display = "block";
  setTimeout(() => (saveMsg.style.display = "none"), 3000);
}

// ── LOGOUT ───────────────────────────────────
document.getElementById("btn-logout").addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "index.html";
});

// ── UTILS ────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
