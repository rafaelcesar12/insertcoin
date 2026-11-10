const { createHmac, timingSafeEqual } = require("node:crypto");

const provider = "https://steamcommunity.com/openid/login";
const namespace = "http://specs.openid.net/auth/2.0";
const firebaseKey = "AIzaSyCNDgP0z8hUi1w47tVxkUKMD0Hxq2Psnaw";

function reject(status, message) {
  throw Object.assign(new Error(message), { status });
}

function signature(key, uid, steamId) {
  return createHmac("sha256", key).update(JSON.stringify([uid, steamId])).digest("hex");
}

async function request(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") reject(405, "Método inválido.");
    const origin = req.headers.origin;
    if (!origin || new URL(origin).host !== req.headers.host) reject(403, "Origem inválida.");
    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) reject(503, "A integração aguarda a configuração da chave Steam no servidor.");
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) reject(401, "Entre novamente no InsertCoin.");
    const lookup = await request("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + firebaseKey, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: token })
    });
    const uid = lookup.ok && (await lookup.json()).users?.[0]?.localId;
    if (!uid) reject(401, "Entre novamente no InsertCoin.");

    const { action, state, assertion, link, owner } = req.body || {};
    if (action === "start" || action === "finish") {
      if (!/^[a-f0-9-]{36}$/.test(state)) reject(400, "Conexão expirada. Tente novamente.");
      const returnUrl = new URL("/profile.html", origin);
      returnUrl.searchParams.set("state", state);
      returnUrl.searchParams.set("user", uid);
      if (action === "start") {
        const url = new URL(provider);
        const select = namespace + "/identifier_select";
        url.search = new URLSearchParams({
          "openid.ns": namespace, "openid.mode": "checkid_setup", "openid.realm": origin + "/",
          "openid.return_to": returnUrl.href, "openid.identity": select, "openid.claimed_id": select
        });
        return res.json({ url: url.href });
      }
      const fields = new URLSearchParams(assertion);
      const claimed = fields.get("openid.claimed_id");
      const steamId = claimed?.match(/^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/)?.[1];
      const signed = new Set((fields.get("openid.signed") || "").split(","));
      const nonceTime = Date.parse((fields.get("openid.response_nonce") || "").slice(0, 20));
      if (!steamId || !Number.isFinite(nonceTime) || Math.abs(Date.now() - nonceTime) > 600000 ||
          fields.get("openid.identity") !== claimed || fields.get("openid.ns") !== namespace ||
          fields.get("openid.mode") !== "id_res" || fields.get("openid.op_endpoint") !== provider ||
          fields.get("openid.return_to") !== returnUrl.href ||
          !["claimed_id","identity","return_to","response_nonce","op_endpoint","assoc_handle"].every(f => signed.has(f))) {
        reject(400, "A Steam não confirmou esta conexão. Tente novamente.");
      }
      fields.set("openid.mode", "check_authentication");
      const check = await request(provider, { method: "POST", body: fields });
      if (!check.ok || !/^is_valid:true\s*$/m.test(await check.text())) reject(403, "Confirmação Steam inválida.");
      return res.json({ steamId, proof: signature(key, uid, steamId) });
    }

    if (action !== "library" || typeof owner !== "string" || !/^\d{17}$/.test(link?.steamId) ||
        !/^[a-f0-9]{64}$/.test(link?.proof) ||
        !timingSafeEqual(Buffer.from(link.proof), Buffer.from(signature(key, owner, link.steamId)))) {
      reject(400, "Reconecte a conta Steam no perfil.");
    }
    const url = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/");
    url.search = new URLSearchParams({ key, steamid: link.steamId, include_appinfo: "1", include_played_free_games: "1" });
    const response = await request(url);
    if (!response.ok) reject(502, "Falha ao consultar a Steam. Tente novamente.");
    const library = (await response.json()).response;
    if (!Number.isInteger(library?.game_count)) reject(422, "Biblioteca indisponível. Confira se os detalhes de jogos estão públicos na Steam.");
    if (library.game_count && !Array.isArray(library.games)) reject(502, "Resposta incompleta da Steam.");
    return res.json({ games: (library.games || []).map(({ appid, name }) => ({ appid, name })) });
  } catch (err) {
    return res.status(err.status || 502).json({ error: err.status ? err.message : "Serviço indisponível. Tente novamente." });
  }
};
