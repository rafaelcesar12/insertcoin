import { auth } from "./firebase-config.js";
import { getUserProfile, updateUserProfile } from "./firestore.js";

async function api(body) {
  const response = await fetch("/api/steam", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + await auth.currentUser.getIdToken() },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível acessar a integração Steam.");
  return data;
}

async function library(profile) {
  if (!profile?.steamAccount) throw new Error((profile?.nickname || "Um membro") + " ainda precisa conectar a Steam.");
  try {
    return (await api({ action: "library", owner: profile.uid, link: profile.steamAccount })).games;
  } catch (error) {
    throw new Error((profile.nickname || "Jogador") + " · " + error.message);
  }
}

export function commonGames(libraries) {
  if (!libraries.length) return [];
  const others = libraries.slice(1).map(games => new Set(games.map(game => game.appid)));
  return libraries[0].filter(game => others.every(ids => ids.has(game.appid)));
}

function gameList(parent, games, empty, pick) {
  parent.replaceChildren();
  if (!games.length) { parent.textContent = empty; return; }
  const filter = document.createElement("input");
  filter.type = "search";
  filter.placeholder = "Filtrar " + games.length + " jogos";
  filter.setAttribute("aria-label", "Filtrar jogos por nome");
  const list = document.createElement("ul");
  list.className = "steam-games";
  const ordered = [...games].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  function render() {
    const rows = ordered.filter(g => g.name.toLowerCase().includes(filter.value.trim().toLowerCase())).map(game => {
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.href = "https://store.steampowered.com/app/" + game.appid + "/";
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = game.name;
      row.append(link);
      if (pick) row.append(button("Escolher", () => pick(game)));
      return row;
    });
    list.replaceChildren(...rows);
    if (!rows.length) list.textContent = "Nenhum resultado.";
  }
  filter.oninput = render;
  parent.append(filter, list);
  render();
}

function button(label, action) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "btn btn-ghost";
  el.textContent = label;
  el.onclick = async () => {
    el.disabled = true;
    try { await action(); } finally { el.disabled = false; }
  };
  return el;
}

export async function profileLibrary(parent, profile, mine) {
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const controls = document.createElement("div");
  const results = document.createElement("div");
  parent.replaceChildren(controls, status, results);
  async function refresh() {
    results.replaceChildren();
    status.textContent = "Consultando a Steam…";
    try {
      const games = await library(profile);
      status.textContent = games.length + " jogos na biblioteca";
      gameList(results, games, "Biblioteca vazia.");
    } catch (e) { status.textContent = e.message; }
  }
  const params = new URLSearchParams(location.search);
  if (mine && params.has("state")) {
    history.replaceState(null, "", location.pathname);
    const state = sessionStorage.getItem("steam-state");
    sessionStorage.removeItem("steam-state");
    try {
      if (!state || params.get("state") !== state) throw new Error("Conexão expirada. Tente novamente.");
      const assertion = [...params].filter(([k]) => k.startsWith("openid."));
      const account = await api({ action: "finish", state, assertion });
      await updateUserProfile(profile.uid, { steamAccount: account });
      profile.steamAccount = account;
    } catch (e) { status.textContent = e.message; }
  }
  if (profile.steamAccount) {
    controls.append(button("Atualizar biblioteca", refresh));
    if (mine) controls.append(button("Desconectar Steam", async () => {
      try {
        await updateUserProfile(profile.uid, { steamAccount: null });
        profile.steamAccount = null;
        await profileLibrary(parent, profile, true);
      } catch { status.textContent = "Não foi possível desconectar. Tente novamente."; }
    }));
    await refresh();
  } else if (mine) {
    status.textContent ||= "Conecte a Steam para exibir seus jogos no perfil e comparar bibliotecas.";
    controls.append(button("Conectar Steam", async () => {
      try {
        const state = crypto.randomUUID();
        sessionStorage.setItem("steam-state", state);
        location.assign((await api({ action: "start", state })).url);
      } catch (e) { status.textContent = e.message; }
    }));
  } else status.textContent = "Este amigo ainda não conectou a Steam.";
}

export function comparison(parent, label, members, pick) {
  const result = document.createElement("div");
  result.setAttribute("aria-live", "polite");
  parent.append(button(label, async () => {
    result.textContent = "Comparando bibliotecas…";
    try {
      const ids = await members();
      const libraries = await Promise.all([...new Set(ids)].map(async uid => library(await getUserProfile(uid))));
      const games = commonGames(libraries);
      gameList(result, games, "Nenhum jogo em comum.", pick && (async game => {
        try { await pick(game); } catch { result.textContent = "Não foi possível escolher o jogo. Atualize o squad e tente novamente."; }
      }));
    } catch (e) { result.textContent = e.message; }
  }), result);
}
