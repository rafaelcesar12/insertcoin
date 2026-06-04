// =============================================
// INSERT COIN — Home Logic
// =============================================

import { auth } from "./firebase-config.js";
import { requireAuth, logoutUser } from "./auth.js";
import {
  getUserProfile,
  createPost,
  getRecentPosts,
  likePost,
  formatTimestamp
} from "./firestore.js";

let currentUser = null;
let userProfile = null;

// ── INIT ─────────────────────────────────────
const user = await requireAuth("index.html");
currentUser = user;
userProfile = await getUserProfile(user.uid);

// Populate UI
setTopBar();
setSidebarUser();
setDate();
loadFeed();

// ── TOP BAR ──────────────────────────────────
function setTopBar() {
  const nick = userProfile?.nickname || user.email;
  document.getElementById("top-nick").textContent = nick;
  setAvatarEl(document.getElementById("comp-avatar"), nick);
}

function setDate() {
  const d = new Date();
  const opts = { weekday: "short", day: "2-digit", month: "long", year: "numeric" };
  document.getElementById("top-date").textContent = d.toLocaleDateString("pt-BR", opts);
}

function setAvatarEl(el, nickname, avatarUrl = "") {
  if (avatarUrl) {
    el.innerHTML = `<img src="${avatarUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    el.textContent = (nickname || "?")[0].toUpperCase();
  }
}

function setSidebarUser() {
  if (!userProfile) return;
  const { nickname, xp = 0, level = 1, avatarUrl = "" } = userProfile;
  document.getElementById("side-nick").textContent = nickname;
  document.getElementById("side-level").textContent = level;
  document.getElementById("side-xp").textContent = xp;
  const pct = (xp % 100);
  document.getElementById("side-xp-bar").style.width = `${pct}%`;
  setAvatarEl(document.getElementById("side-avatar"), nickname, avatarUrl);
}

// ── FEED ─────────────────────────────────────
async function loadFeed() {
  const container = document.getElementById("feed-container");
  const loading   = document.getElementById("feed-loading");
  loading.style.display = "flex";
  container.innerHTML = "";

  try {
    const posts = await getRecentPosts(30);
    loading.style.display = "none";

    if (posts.length === 0) {
      container.innerHTML = `
        <div class="feed-empty">
          <div class="empty-icon">📡</div>
          <p>Nenhuma transmissão ainda.<br>Seja o primeiro a postar na arena!</p>
        </div>`;
      return;
    }

    posts.forEach(post => container.appendChild(buildPostCard(post)));
  } catch (e) {
    loading.style.display = "none";
    container.innerHTML = `<div class="feed-empty"><p>Erro ao carregar o feed. Verifique sua conexão.</p></div>`;
    console.error(e);
  }
}

function buildPostCard(post) {
  const card = document.createElement("div");
  card.className = "post-card";

  const nick = post.authorNickname || "Anon";
  const time = formatTimestamp(post.createdAt);
  const tag  = post.gameTag ? `<span class="game-tag">#${post.gameTag}</span>` : "";

  card.innerHTML = `
    <div class="post-header">
      <div class="avatar" style="width:34px;height:34px;font-size:13px;">${nick[0].toUpperCase()}</div>
      <div>
        <div class="post-author">${escHtml(nick)}</div>
        ${tag}
      </div>
      <div class="post-time">${time}</div>
    </div>
    <div class="post-content">${escHtml(post.content)}</div>
    <div class="post-actions">
      <button class="post-action-btn" data-id="${post.id}" data-type="like">
        ❤️ <span>${post.likesCount || 0}</span>
      </button>
      <button class="post-action-btn" data-id="${post.id}" data-type="comment">
        💬 <span>${post.commentsCount || 0}</span>
      </button>
      ${post.authorUid === currentUser.uid ? `
      <button class="post-action-btn" data-id="${post.id}" data-type="delete" style="margin-left:auto;color:#ff3355;">
        🗑️ remover
      </button>` : ""}
    </div>`;

  // Like action
  card.querySelector('[data-type="like"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.classList.contains("liked")) return;
    btn.classList.add("liked");
    const countEl = btn.querySelector("span");
    countEl.textContent = parseInt(countEl.textContent) + 1;
    await likePost(post.id, currentUser.uid).catch(() => {});
  });

  return card;
}

// ── NEW POST ──────────────────────────────────
const btnPost     = document.getElementById("btn-post");
const postContent = document.getElementById("post-content");
const postTag     = document.getElementById("post-tag");
const postText    = document.getElementById("post-text");
const postSpinner = document.getElementById("post-spinner");

btnPost.addEventListener("click", async () => {
  const content = postContent.value.trim();
  const tag     = postTag.value.trim().replace("#", "");

  if (!content) {
    showToast("Escreva algo antes de postar!", "error");
    return;
  }
  if (content.length > 500) {
    showToast("Máximo de 500 caracteres.", "error");
    return;
  }

  btnPost.disabled = true;
  postText.style.display = "none";
  postSpinner.style.display = "block";

  try {
    const nick = userProfile?.nickname || currentUser.email;
    await createPost(currentUser.uid, nick, content, tag);
    postContent.value = "";
    postTag.value = "";
    showToast("Post publicado! +5 XP 🎮");
    await loadFeed();
    // Refresh profile XP
    userProfile = await getUserProfile(currentUser.uid);
    setSidebarUser();
  } catch (e) {
    showToast("Erro ao publicar. Tente novamente.", "error");
    console.error(e);
  } finally {
    btnPost.disabled = false;
    postText.style.display = "inline";
    postSpinner.style.display = "none";
  }
});

// Ctrl+Enter to post
postContent.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) btnPost.click();
});

// ── REFRESH ───────────────────────────────────
document.getElementById("btn-refresh").addEventListener("click", () => loadFeed());

// ── LOGOUT ───────────────────────────────────
document.getElementById("btn-logout").addEventListener("click", async () => {
  await logoutUser();
  window.location.href = "index.html";
});

// ── TOAST ────────────────────────────────────
function showToast(msg, type = "success") {
  const c = document.getElementById("toast-container");
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ── UTILS ────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
