// =============================================
// INSERT COIN — Home Logic v2
// =============================================

import { auth } from "./firebase-config.js";
import { requireAuth, logoutUser } from "./auth.js";
import {
  getUserProfile, createPost, getRecentPosts, likePost, unlikePost,
  deletePost, getOnlinePlayers, getOpenSquads, joinSquad,
  addComment, getComments, formatTimestamp, setUserOnline,
  sendFriendRequest, acceptFriendRequest, rejectFriendRequest
} from "./firestore.js";
import { uploadImage, createPreviewUrl } from "./upload.js";

let currentUser  = null;
let userProfile  = null;
let selectedFile = null;

// ── INIT ─────────────────────────────────────
const user = await requireAuth("index.html");
currentUser = user;
userProfile = await getUserProfile(user.uid);

// Mark online
await setUserOnline(user.uid, true).catch(() => {});
window.addEventListener("beforeunload", () => setUserOnline(user.uid, false).catch(() => {}));

// UI
setTopBar();
setSidebarUser();
setDate();
loadFeed();
loadOnlinePlayers();
loadSquadsWidget();
loadFriendRequests();
checkAdmin();

// ── TOP BAR ──────────────────────────────────
function setTopBar() {
  const nick = userProfile?.nickname || user.email;
  document.getElementById("top-nick").textContent = nick;
  setAvatarEl(document.getElementById("comp-avatar"), nick, userProfile?.avatarUrl);
}

function setDate() {
  const opts = { weekday: "short", day: "2-digit", month: "long", year: "numeric" };
  document.getElementById("top-date").textContent = new Date().toLocaleDateString("pt-BR", opts);
}

function setAvatarEl(el, nickname, avatarUrl = "") {
  if (avatarUrl) {
    el.innerHTML = `<img src="${avatarUrl}" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    el.textContent = (nickname || "?")[0].toUpperCase();
  }
}

function setSidebarUser() {
  if (!userProfile) return;
  const { nickname, xp = 0, level = 1, avatarUrl = "" } = userProfile;
  document.getElementById("side-nick").textContent  = nickname;
  document.getElementById("side-level").textContent = level;
  document.getElementById("side-xp").textContent    = xp;
  document.getElementById("side-xp-bar").style.width = `${xp % 100}%`;
  setAvatarEl(document.getElementById("side-avatar"), nickname, avatarUrl);
}

function checkAdmin() {
  if (userProfile?.isAdmin) {
    document.getElementById("admin-nav-item").style.display = "block";
  }
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

    if (!posts.length) {
      container.innerHTML = `<div class="feed-empty"><div class="empty-icon">📡</div><p>Nenhuma transmissão ainda.<br>Seja o primeiro a postar na arena!</p></div>`;
      return;
    }
    posts.forEach(p => container.appendChild(buildPostCard(p)));
  } catch (e) {
    loading.style.display = "none";
    container.innerHTML = `<div class="feed-empty"><p>Erro ao carregar o feed.</p></div>`;
  }
}

function buildPostCard(post) {
  const card = document.createElement("div");
  card.className = "post-card";
  card.id = `post-${post.id}`;

  const nick    = post.authorNickname || "Anon";
  const time    = formatTimestamp(post.createdAt);
  const tag     = post.gameTag ? `<span class="game-tag">#${escHtml(post.gameTag)}</span>` : "";
  const isOwner = post.authorUid === currentUser.uid;
  const likedBy = post.likedBy || [];
  const hasLiked = likedBy.includes(currentUser.uid);
  const imgHtml = post.imageUrl ? `<img class="post-image" src="${escHtml(post.imageUrl)}" alt="post image" loading="lazy" />` : "";

  card.innerHTML = `
    <div class="post-header">
      <div class="avatar" style="width:34px;height:34px;font-size:13px;">${nick[0].toUpperCase()}</div>
      <div><div class="post-author">${escHtml(nick)}</div>${tag}</div>
      <div class="post-time">${time}</div>
    </div>
    <div class="post-content">${escHtml(post.content)}</div>
    ${imgHtml}
    <div class="post-actions">
      <button class="post-action-btn like-btn ${hasLiked ? "liked" : ""}" data-id="${post.id}">
        ${hasLiked ? "❤️" : "🤍"} <span>${post.likesCount || 0}</span>
      </button>
      <button class="post-action-btn comment-btn" data-id="${post.id}">
        💬 <span>${post.commentsCount || 0}</span>
      </button>
      ${!isOwner ? `<button class="post-action-btn add-friend-btn" data-uid="${post.authorUid}" data-nick="${escHtml(nick)}">➕ Adicionar</button>` : ""}
      ${isOwner ? `<button class="post-action-btn delete-btn" data-id="${post.id}" style="margin-left:auto;">🗑️ Deletar</button>` : ""}
    </div>
    <div class="comments-section" id="comments-${post.id}">
      <div class="comments-list" id="clist-${post.id}"></div>
      <div class="comment-input-row">
        <input type="text" placeholder="Comentar..." id="cinput-${post.id}" maxlength="200" />
        <button class="btn btn-outline send-comment-btn" data-id="${post.id}" style="padding:7px 14px;font-size:10px;">→</button>
      </div>
    </div>`;

  // Like / unlike
  card.querySelector(".like-btn").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const countEl = btn.querySelector("span");
    const liked = btn.classList.contains("liked");

    btn.classList.toggle("liked", !liked);
    btn.querySelector("span") || btn;
    countEl.textContent = parseInt(countEl.textContent) + (liked ? -1 : 1);
    btn.textContent = "";
    btn.innerHTML = `${!liked ? "❤️" : "🤍"} <span>${countEl.textContent}</span>`;
    btn.className = `post-action-btn like-btn ${!liked ? "liked" : ""}`;
    btn.dataset.id = post.id;

    if (!liked) await likePost(post.id, currentUser.uid).catch(() => {});
    else await unlikePost(post.id, currentUser.uid).catch(() => {});
  });

  // Comments toggle
  card.querySelector(".comment-btn").addEventListener("click", async (e) => {
    const section = document.getElementById(`comments-${post.id}`);
    const isOpen = section.classList.toggle("open");
    if (isOpen) await loadComments(post.id);
  });

  // Delete
  const delBtn = card.querySelector(".delete-btn");
  if (delBtn) {
    delBtn.addEventListener("click", async () => {
      if (!confirm("Deletar este post?")) return;
      try {
        await deletePost(post.id, currentUser.uid);
        card.remove();
        showToast("Post deletado.");
      } catch { showToast("Erro ao deletar.", "error"); }
    });
  }

  // Add friend
  const addFriendBtn = card.querySelector(".add-friend-btn");
  if (addFriendBtn) {
    addFriendBtn.addEventListener("click", async (e) => {
      const toUid = e.currentTarget.dataset.uid;
      const toNick = e.currentTarget.dataset.nick;
      try {
        await sendFriendRequest(currentUser.uid, toUid);
        e.currentTarget.textContent = "✅ Enviado";
        e.currentTarget.disabled = true;
        showToast(`Pedido enviado para ${toNick}!`);
      } catch { showToast("Erro ao enviar pedido.", "error"); }
    });
  }

  // Send comment
  card.querySelector(".send-comment-btn").addEventListener("click", () => submitComment(post.id));
  card.querySelector(`#cinput-${post.id}`).addEventListener("keydown", e => {
    if (e.key === "Enter") submitComment(post.id);
  });

  return card;
}

async function loadComments(postId) {
  const list = document.getElementById(`clist-${postId}`);
  list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:4px 0;">Carregando...</div>`;
  const comments = await getComments(postId).catch(() => []);
  if (!comments.length) {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;padding:4px 0;">Nenhum comentário ainda.</div>`;
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment-item">
      <div class="avatar" style="width:26px;height:26px;font-size:10px;flex-shrink:0;">${(c.authorNickname||"?")[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="comment-nick">${escHtml(c.authorNickname || "Anon")}</span>
          <span class="comment-time">${formatTimestamp(c.createdAt)}</span>
        </div>
        <div class="comment-text">${escHtml(c.content)}</div>
      </div>
    </div>`).join("");
}

async function submitComment(postId) {
  const input = document.getElementById(`cinput-${postId}`);
  const text  = input.value.trim();
  if (!text) return;
  input.value = "";
  const nick = userProfile?.nickname || currentUser.email;
  await addComment(postId, currentUser.uid, nick, text).catch(() => {});
  await loadComments(postId);
  // Update comment count in button
  const btn = document.querySelector(`[data-id="${postId}"].comment-btn span`);
  if (btn) btn.textContent = parseInt(btn.textContent) + 1;
}

// ── NEW POST ──────────────────────────────────
const imgInput   = document.getElementById("post-image-input");
const imgPreview = document.getElementById("img-preview");
const imgWrap    = document.getElementById("img-preview-wrap");
const imgRemove  = document.getElementById("img-remove-btn");

imgInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile = file;
  imgPreview.src = createPreviewUrl(file);
  imgWrap.style.display = "block";
});

imgRemove.addEventListener("click", () => {
  selectedFile = null;
  imgInput.value = "";
  imgPreview.src = "";
  imgWrap.style.display = "none";
});

document.getElementById("btn-post").addEventListener("click", async () => {
  const content = document.getElementById("post-content").value.trim();
  const tag     = document.getElementById("post-tag").value.trim().replace("#", "");

  if (!content && !selectedFile) { showToast("Escreva algo ou adicione uma imagem!", "error"); return; }
  if (content.length > 500) { showToast("Máximo de 500 caracteres.", "error"); return; }

  const btn     = document.getElementById("btn-post");
  const btnText = document.getElementById("post-text");
  const spinner = document.getElementById("post-spinner");
  btn.disabled = true; btnText.style.display = "none"; spinner.style.display = "block";

  try {
    let imageUrl = "";
    if (selectedFile) {
      showToast("Enviando imagem...", "info");
      imageUrl = await uploadImage(selectedFile, "posts");
    }
    const nick = userProfile?.nickname || currentUser.email;
    await createPost(currentUser.uid, nick, content, tag, imageUrl);
    document.getElementById("post-content").value = "";
    document.getElementById("post-tag").value = "";
    selectedFile = null; imgInput.value = ""; imgPreview.src = ""; imgWrap.style.display = "none";
    showToast("Post publicado! +5 XP 🎮");
    userProfile = await getUserProfile(currentUser.uid);
    setSidebarUser();
    await loadFeed();
  } catch (e) {
    showToast(e.message || "Erro ao publicar.", "error");
  } finally {
    btn.disabled = false; btnText.style.display = "inline"; spinner.style.display = "none";
  }
});

document.getElementById("post-content").addEventListener("keydown", e => {
  if (e.key === "Enter" && e.ctrlKey) document.getElementById("btn-post").click();
});

document.getElementById("btn-refresh").addEventListener("click", loadFeed);

// ── ONLINE PLAYERS ────────────────────────────
async function loadOnlinePlayers() {
  const list = document.getElementById("online-list");
  try {
    const players = await getOnlinePlayers(8);
    if (!players.length) { list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">Nenhum player online.</div>`; return; }
    list.innerHTML = players.map(p => `
      <div class="online-user">
        <div class="avatar" style="width:30px;height:30px;font-size:12px;">${(p.nickname||"?")[0].toUpperCase()}</div>
        <div>
          <div class="online-nick">${escHtml(p.nickname || "?")}</div>
          <div class="online-platform">${escHtml(p.mainPlatform || "")}</div>
        </div>
        <div class="${p.isOnline ? "online-dot" : "offline-dot"}"></div>
      </div>`).join("");
  } catch {
    list.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">Erro ao carregar.</div>`;
  }
}

// ── SQUADS WIDGET ─────────────────────────────
async function loadSquadsWidget() {
  const widget = document.getElementById("squads-widget");
  try {
    const squads = await getOpenSquads(5);
    if (!squads.length) { widget.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">Nenhum squad aberto.</div>`; return; }
    widget.innerHTML = squads.map(s => `
      <div class="squad-card">
        <div class="squad-name">🛡️ ${escHtml(s.name)}</div>
        <div class="squad-meta">
          <span>${escHtml(s.game)} · ${escHtml(s.platform)}</span>
          <span>${s.members?.length || 1}/${s.maxPlayers} vagas</span>
        </div>
        <div style="margin-top:6px;display:flex;justify-content:flex-end;">
          <button class="squad-join-btn" data-id="${s.id}" data-name="${escHtml(s.name)}">Entrar</button>
        </div>
      </div>`).join("");
    widget.querySelectorAll(".squad-join-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        const id   = e.currentTarget.dataset.id;
        const name = e.currentTarget.dataset.name;
        try {
          await joinSquad(id, currentUser.uid, userProfile?.nickname || "?");
          showToast(`Você entrou no squad ${name}! +5 XP 🛡️`);
          await loadSquadsWidget();
        } catch (err) { showToast(err.message, "error"); }
      });
    });
  } catch {
    widget.innerHTML = `<div style="color:var(--text-muted);font-size:12px;">Erro ao carregar squads.</div>`;
  }
}

// ── FRIEND REQUESTS ───────────────────────────
async function loadFriendRequests() {
  if (!userProfile?.friendRequests?.length) return;
  const widget = document.getElementById("friend-reqs-widget");
  const list   = document.getElementById("friend-reqs-list");
  const badge  = document.getElementById("req-badge");
  const reqs   = userProfile.friendRequests;

  widget.style.display = "block";
  badge.style.display  = "inline";
  badge.textContent    = reqs.length;

  const profiles = await Promise.all(reqs.map(uid => getUserProfile(uid)));
  list.innerHTML = profiles.filter(Boolean).map(p => `
    <div class="friend-req">
      <div class="avatar" style="width:28px;height:28px;font-size:11px;">${(p.nickname||"?")[0].toUpperCase()}</div>
      <span style="font-size:12px;font-family:var(--font-head);color:var(--text);">${escHtml(p.nickname)}</span>
      <div class="freq-actions">
        <button class="btn btn-primary accept-req" data-uid="${p.uid}" style="padding:3px 8px;font-size:10px;">✓</button>
        <button class="btn btn-danger reject-req" data-uid="${p.uid}" style="padding:3px 8px;font-size:10px;">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll(".accept-req").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      await acceptFriendRequest(currentUser.uid, e.currentTarget.dataset.uid);
      showToast("Amizade aceita! +5 XP 👥");
      userProfile = await getUserProfile(currentUser.uid);
      await loadFriendRequests();
    });
  });
  list.querySelectorAll(".reject-req").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      await rejectFriendRequest(currentUser.uid, e.currentTarget.dataset.uid);
      userProfile = await getUserProfile(currentUser.uid);
      await loadFriendRequests();
    });
  });
}

// ── NEWS ──────────────────────────────────────
const NEWS_FEEDS = {
  ign:      { label: "IGN BR",      url: "https://br.ign.com/feed.xml" },
  theenemy: { label: "The Enemy",   url: "https://www.theenemy.com.br/feed" },
  voxel:    { label: "Voxel",       url: "https://voxel.com.br/feed/" }
};

let currentNewsSrc = "ign";

document.querySelectorAll(".feed-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".feed-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab-feed").style.display  = tab.dataset.tab === "feed"  ? "flex" : "none";
    document.getElementById("tab-news").style.display  = tab.dataset.tab === "news"  ? "block" : "none";
    document.getElementById("tab-feed").style.flexDirection = "column";
    if (tab.dataset.tab === "news") loadNews(currentNewsSrc);
  });
});

document.querySelectorAll(".news-src").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".news-src").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentNewsSrc = btn.dataset.src;
    loadNews(currentNewsSrc);
  });
});

async function loadNews(src) {
  const container = document.getElementById("news-container");
  const loading   = document.getElementById("news-loading");
  container.innerHTML = "";
  loading.style.display = "flex";

  const feed = NEWS_FEEDS[src];
  if (!feed) return;

  const API_URL = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&api_key=&count=15`;

  try {
    const res  = await fetch(API_URL);
    const data = await res.json();
    loading.style.display = "none";

    if (data.status !== "ok" || !data.items?.length) {
      container.innerHTML = `<div class="feed-empty"><p>Não foi possível carregar as notícias.<br>Tente novamente mais tarde.</p></div>`;
      return;
    }

    container.innerHTML = data.items.map(item => {
      const thumb = item.thumbnail || item.enclosure?.link || "";
      const date  = item.pubDate ? new Date(item.pubDate).toLocaleDateString("pt-BR") : "";
      return `
        <a class="news-card" href="${escHtml(item.link)}" target="_blank" rel="noopener">
          ${thumb ? `<img class="news-thumb" src="${escHtml(thumb)}" alt="" loading="lazy" onerror="this.style.display='none'" />` : ""}
          <div style="flex:1;min-width:0;">
            <div class="news-source">${feed.label}</div>
            <div class="news-title">${escHtml(item.title)}</div>
            <div class="news-date">${date}</div>
          </div>
        </a>`;
    }).join("");
  } catch {
    loading.style.display = "none";
    container.innerHTML = `<div class="feed-empty"><p>Erro ao carregar notícias.</p></div>`;
  }
}

// ── LOGOUT ───────────────────────────────────
document.getElementById("btn-logout").addEventListener("click", async () => {
  await setUserOnline(currentUser.uid, false).catch(() => {});
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

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
