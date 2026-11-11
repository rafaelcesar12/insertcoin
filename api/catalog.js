const store = "https://store.steampowered.com/api/";
const web = "https://api.steampowered.com/";

async function read(url) {
  const result = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!result.ok) throw new Error("Steam indisponível");
  return result.json();
}

module.exports = async function catalog(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { view = "deals", q, id } = req.query;
  try {
    let items;
    if (view === "search" && typeof q === "string" && q.trim().length >= 2 && q.length <= 80) {
      const result = await read(store + "storesearch/?" + new URLSearchParams({ term: q.trim(), cc: "br", l: "brazilian" }));
      items = result.items.filter(item => item.type === "app").map(item => ({ id: item.id, name: item.name, image: item.tiny_image }));
    } else if (["sellers","wishlist","calendar","ratings"].includes(view)) {
      const filters={sellers:"globaltopsellers",wishlist:"popularwishlist",calendar:"popularcomingsoon"};
      const params=new URLSearchParams({start:"0",count:"50",cc:"br",l:"brazilian",json:"1",infinite:"1"});
      if(view==="ratings"){params.set("sort_by","Reviews_DESC");params.set("l","english");}
      else params.set("filter",filters[view]);
      if(view==="calendar")params.set("sort_by","Released_ASC");
      const result=await read("https://store.steampowered.com/search/results/?"+params);
      if(typeof result.results_html!=="string")throw Error("Formato indisponível");
      const $=require("cheerio").load(result.results_html);
      items=[];
      $("a.search_result_row").each((_,node)=>{
        const row=$(node),id=row.attr("data-ds-appid");
        if(!/^[1-9]\d*$/.test(id))return;
        const summary=row.find(".search_review_summary").attr("data-tooltip-html") || "";
        const rating=summary.match(/([\d.]+)% of the ([\d,]+) user reviews/);
        const reviews=rating ? Number(rating[2].replaceAll(",","")) : null;
        const positive=rating ? Number(rating[1]) : null;
        items.push({reviews,positive,id:Number(id),name:row.find(".title").text().trim(),image:row.find("img").attr("src"),release:row.find(".search_released").text().trim()});
      });
      if(view==="ratings"){
        items=items.filter(game=>game.reviews>=500 && game.positive!==null);
        items.sort((a,b)=>b.positive-a.positive || b.reviews-a.reviews);
      }
    } else if (view === "charts" || view === "daily") {
      const chart = await read(web + "ISteamChartsService/GetMostPlayedGames/v1/");
      const ranks = chart.response.ranks.slice(0, 20);
      const query = { ids: ranks.map(row => ({ appid: row.appid })), context: { country_code: "BR", language: "brazilian" }, data_request: { include_assets: true } };
      const catalog = await read(web + "IStoreBrowseService/GetItems/v1/?input_json=" + encodeURIComponent(JSON.stringify(query)));
      const games = new Map(catalog.response.store_items.map(game => [game.appid, game]));
      items = ranks.map(row => {
        const game = games.get(row.appid);
        const assets = game?.assets;
        const image = assets?.small_capsule && assets.asset_url_format ?
          "https://shared.akamai.steamstatic.com/store_item_assets/" + assets.asset_url_format.replace("${FILENAME}", assets.small_capsule) : null;
        return { id: row.appid, rank: row.rank, peak: row.peak_in_game, name: game?.name || "App " + row.appid, image };
      });
    } else if (view === "deals") {
      const result = await read(store + "featuredcategories?cc=br&l=brazilian");
      items = result.specials.items.filter(item => item.type === 0 && item.discount_percent > 0 && item.currency === "BRL").map(item => ({
        id: item.id, name: item.name, image: item.small_capsule_image, price: item.final_price / 100, discount: item.discount_percent
      }));
    } else if (view === "game" && /^[1-9]\d{0,9}$/.test(id)) {
      const [details, online] = await Promise.all([
        read(store + "appdetails?cc=br&l=brazilian&appids=" + id),
        read(web + "ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=" + id).catch(() => null)
      ]);
      const game = details[id]?.data;
      if (!game) return res.status(404).json({ error: "Jogo indisponível na loja brasileira." });
      items = [{ id: game.steam_appid, name: game.name, image: game.header_image, modes: (game.categories || []).filter(c => [1,9,24,36,37,38,39,47,48,49].includes(c.id)).map(c => c.description),
        online: online?.response?.result === 1 ? online.response.player_count : null, release: game.release_date?.date,
        priceLabel: game.is_free ? "Gratuito" : game.price_overview?.final_formatted }];
    } else return res.status(400).json({ error: "Consulta inválida." });
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=300, stale-while-revalidate=600");
    return res.json({ items });
  } catch { return res.status(502).json({ error: "A Steam está indisponível. Tente novamente." }); }
};
