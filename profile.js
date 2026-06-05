// =============================================
// INSERT COIN — Profile Logic v2
// =============================================

import { requireAuth, logoutUser } from "./auth.js";
import { getUserProfile, updateUserProfile } from "./firestore.js";

let currentUser = null;
let userProfile = null;
let selectedPlatform = "";
const editGames = [];

const user = await requireAuth("index.html");
currentUser = user;
userProfile = await getUserProfile(user.uid);

document.getElementById("page-loading").style.display = "none";
document.getElementById("profile-wrap").style.display = "flex";

populateProfile();
populateEditForm();

// ── DISPLAY ───────────────────────────────────
function populateProfile() {
  if (!userProfile) return;
  const {
    nickname, email, mainPlatform, favoriteGames = [], bio = "",
    xp = 0, level = 1, avatarUrl = "",
    city = "", state = "", country = "",
    socialLinks = {}
  } = userProfile;

  document.getElementById("p-nick").textContent     = nickname || "—";
  document.getElementById("p-email").textContent    = email || currentUser.email;
  document.getElementById("p-platform").textContent = mainPlatform || "";
  document.getElementById("p-bio").textContent      = bio || "Sem bio ainda.";
  document.getElementById("p-level").textContent    = level;
  document.getElementById("p-xp").textContent       = xp;
  document.getElementById("p-xp-next").textContent  = level * 100;
  document.getElementById("p-xp-bar").style.width   = `${xp % 100}%`;

  // Location
  const parts = [city, state, country].filter(Boolean);
  document.getElementById("p-location").textContent = parts.length ? `📍 ${parts.join(", ")}` : "";

  // Avatar
  const avatarEl = document.getElementById("p-avatar");
  if (avatarUrl) {
    avatarEl.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    avatarEl.textContent = (nickname || "?")[0].toUpperCase();
  }

  // Games
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

  // Social links
  const socialEl = document.getElementById("p-social-links");
  socialEl.innerHTML = "";
  const socials = [
    { key: "discord",  icon: "💬", label: "Discord",    cls: "social-discord",  prefix: "" },
    { key: "steam",    icon: "🎮", label: "Steam",      cls: "social-steam",    prefix: "https://steamcommunity.com/id/" },
    { key: "epic",     icon: "⬜", label: "Epic",       cls: "social-epic",     prefix: "" },
    { key: "xbox",     icon: "🟩", label: "Xbox",       cls: "social-xbox",     prefix: "" },
    { key: "psn",      icon: "🎮", label: "PSN",        cls: "social-psn",      prefix: "" },
    { key: "twitch",   icon: "🟣", label: "Twitch",     cls: "social-twitch",   prefix: "https://twitch.tv/" },
    { key: "youtube",  icon: "🔴", label: "YouTube",    cls: "social-youtube",  prefix: "" }
  ];
  socials.forEach(s => {
    const val = socialLinks[s.key];
    if (!val) return;
    const isUrl = val.startsWith("http");
    const href  = isUrl ? val : (s.prefix ? s.prefix + val : "#");
    const a = document.createElement("a");
    a.className = `social-link-btn ${s.cls}`;
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.innerHTML = `${s.icon} ${escHtml(val)}`;
    socialEl.appendChild(a);
  });
  if (!socialEl.children.length) {
    socialEl.innerHTML = `<span style="color:var(--text-muted);font-size:13px;">Nenhum link cadastrado.</span>`;
  }
}

// ── EDIT FORM ─────────────────────────────────
function populateEditForm() {
  if (!userProfile) return;
  const {
    nickname = "", bio = "", mainPlatform = "", favoriteGames = [],
    city = "", state = "", country = "",
    socialLinks = {}
  } = userProfile;

  document.getElementById("e-nick").value    = nickname;
  document.getElementById("e-bio").value     = bio;
  document.getElementById("e-city").value    = city;
  document.getElementById("e-state").value   = state;
  document.getElementById("e-country").value = country;

  // Social
  document.getElementById("e-discord").value = socialLinks.discord || "";
  document.getElementById("e-steam").value   = socialLinks.steam   || "";
  document.getElementById("e-epic").value    = socialLinks.epic    || "";
  document.getElementById("e-xbox").value    = socialLinks.xbox    || "";
  document.getElementById("e-psn").value     = socialLinks.psn     || "";
  document.getElementById("e-twitch").value  = socialLinks.twitch  || "";
  document.getElementById("e-youtube").value = socialLinks.youtube || "";

  // Platform
  selectedPlatform = mainPlatform;
  document.querySelectorAll(".platform-btn").forEach(b =>
    b.classList.toggle("selected", b.dataset.platform === mainPlatform)
  );

  // Games
  editGames.length = 0;
  document.getElementById("e-games-tags").innerHTML = "";
  favoriteGames.forEach(g => addEditGame(g));
}

// Platform select
document.querySelectorAll(".platform-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".platform-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedPlatform = btn.dataset.platform;
  });
});

// Games
const gameInput = document.getElementById("e-game-input");
function addEditGame(name) {
  if (!name || editGames.includes(name) || editGames.length >= 8) return;
  editGames.push(name);
  const tag = document.createElement("span");
  tag.className = "game-tag";
  tag.style.cssText = "display:inline-flex;align-items:center;gap:4px;";
  tag.innerHTML = `${escHtml(name)} <span class="remove-tag">×</span>`;
  tag.querySelector(".remove-tag").addEventListener("click", () => {
    editGames.splice(editGames.indexOf(name), 1);
    tag.remove();
  });
  document.getElementById("e-games-tags").appendChild(tag);
}
gameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); addEditGame(gameInput.value.trim()); gameInput.value = ""; }
});

// ── SAVE ─────────────────────────────────────
document.getElementById("btn-save").addEventListener("click", async () => {
  const nick = document.getElementById("e-nick").value.trim();
  if (!nick || nick.length < 3) { showSaveMsg("Nickname deve ter pelo menos 3 caracteres.", false); return; }

  const btn = document.getElementById("btn-save");
  btn.disabled = true;
  document.getElementById("save-text").style.display = "none";
  document.getElementById("save-spinner").style.display = "block";

  try {
    await updateUserProfile(currentUser.uid, {
      nickname: nick,
      bio: document.getElementById("e-bio").value.trim(),
      city: document.getElementById("e-city").value.trim(),
      state: document.getElementById("e-state").value.trim(),
      country: document.getElementById("e-country").value.trim(),
      mainPlatform: selectedPlatform,
      favoriteGames: [...editGames],
      socialLinks: {
        discord: document.getElementById("e-discord").value.trim(),
        steam:   document.getElementById("e-steam").value.trim(),
        epic:    document.getElementById("e-epic").value.trim(),
        xbox:    document.getElementById("e-xbox").value.trim(),
        psn:     document.getElementById("e-psn").value.trim(),
        twitch:  document.getElementById("e-twitch").value.trim(),
        youtube: document.getElementById("e-youtube").value.trim()
      }
    });
    userProfile = await getUserProfile(currentUser.uid);
    populateProfile();
    showSaveMsg("Perfil atualizado! 🎮", true);
  } catch {
    showSaveMsg("Erro ao salvar. Tente novamente.", false);
  } finally {
    btn.disabled = false;
    document.getElementById("save-text").style.display = "inline";
    document.getElementById("save-spinner").style.display = "none";
  }
});

function showSaveMsg(msg, ok) {
  const el = document.getElementById("save-msg");
  el.textContent = msg;
  el.className = `save-msg ${ok ? "ok" : "err"}`;
  el.style.display = "block";
  setTimeout(() => (el.style.display = "none"), 3000);
}

document.getElementById("btn-logout").addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "index.html";
});

function escHtml(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
