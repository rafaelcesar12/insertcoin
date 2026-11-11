const list = document.querySelector("#catalog-list");
const status = document.querySelector("#catalog-status");
const dialog = document.querySelector("#game-detail");
const detail = document.querySelector("#detail-body");
const number = new Intl.NumberFormat("pt-BR");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
let latest = 0;
let selected = 0;

function element(tag, text) {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
async function query(params) {
  const response = await fetch("/api/catalog?" + new URLSearchParams(params));
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.items;
}
function artwork(src) {
  const img = document.createElement("img");
  img.src = src;
  img.alt = "";
  img.loading = "lazy";
  return img;
}
async function showGame(id) {
  const request = ++selected;
  detail.textContent = "Consultando a Steam…";
  dialog.showModal();
  try {
    const [game] = await query({ view: "game", id });
    if (request !== selected) return;
    detail.replaceChildren(artwork(game.image), element("h2", game.name));
    const facts = [game.priceLabel, game.release, ...game.modes];
    if (game.online !== null) facts.push(number.format(game.online) + " jogadores agora");
    detail.append(element("p", facts.filter(Boolean).join(" · ")));
    const link = element("a", "Abrir na loja Steam ↗");
    link.href = "https://store.steampowered.com/app/" + id + "/";
    link.target = "_blank";
    link.rel = "noopener";
    detail.append(link);
  } catch { if (request === selected) detail.textContent = "Não foi possível carregar os detalhes. Feche e tente novamente."; }
}
async function load(view, q = "") {
  const request = ++latest;
  document.querySelectorAll("[data-view]").forEach(btn => btn.setAttribute("aria-pressed", btn.dataset.view === view));
  list.replaceChildren();
  status.textContent = "Consultando a Steam…";
  try {
    if(view==="status"){
      const response=await fetch("/api/steam-status");
      if(!response.ok)throw Error();
      const data=await response.json();
      if(request!==latest)return;
      status.textContent="Verificação de acesso pelo servidor do InsertCoin · "+new Date(data.checkedAt).toLocaleString("pt-BR")+" · Não representa todos os servidores Steam.";
      for(const service of data.items){
        const row=element("div","");row.className="catalog-row";
        row.append(element("strong",service.name),element("span",service.state));list.append(row);
      }
      return;
    }
    const games = await query({ view, q });
    if (request !== latest) return;
    status.textContent = games.length ? ({ charts: "Ranking Steam · Pico de jogadores simultâneos",
      calendar:"Próximos lançamentos · Seleção da loja Steam ordenada por lançamento",
      ratings:"Percentual positivo · Mínimo de 500 avaliações · Amostra de 50 resultados da busca Steam por avaliações",
      sellers:"Mais vendidos globalmente · Classificação por receita da Steam",
      wishlist:"Jogos mais desejados · Classificação pública da Steam",
      daily:"Mais jogados por atividade diária · Ordem fornecida pela Steam · Sem contagem de usuários únicos", deals: "Ofertas em destaque · Preços em reais", search: "Resultados para “" + q + "”" })[view] : "Nenhum jogo encontrado.";
    for (const game of games) {
      const row = element("button", "");
      row.className = "catalog-row";
      if (game.rank) row.append(element("small", String(game.rank).padStart(2, "0")));
      if (game.image) row.append(artwork(game.image));
      row.append(element("strong", game.name));
      if (view === "charts") row.append(element("span", number.format(game.peak)));
      if (view === "deals") row.append(element("span", "−" + game.discount + "% · " + money.format(game.price)));
      if(view==="calendar")row.append(element("span",game.release || "Data a confirmar"));
      if(view==="ratings")row.append(element("span",game.positive+"% · "+number.format(game.reviews)+" avaliações"));
      row.onclick = () => showGame(game.id);
      list.append(row);
    }
  } catch { if (request === latest) status.textContent = "Não foi possível consultar a Steam. Selecione a aba ou repita a busca."; }
}
document.querySelector("#close-detail").onclick = () => dialog.close();
document.querySelectorAll("[data-view]").forEach(btn => btn.onclick = () => load(btn.dataset.view));
document.querySelector("#search-steam").onsubmit = event => {
  event.preventDefault();
  load("search", document.querySelector("#query").value.trim());
};
load("charts");
