const { AccessToken } = require("livekit-server-sdk");
const {identity,base,cameraEnabled,sources} = require("../lib/platform");
module.exports = async function voice(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const bearer = req.headers.authorization;
  if (!bearer?.startsWith("Bearer ")) return res.status(401).json({error:"Entre no InsertCoin."});
  const id = req.body?.squad;
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return res.status(400).json({error:"Squad inválido."});
  try {
    const uid = await identity(bearer);
    if (!uid) return res.status(401).json({error:"Entre novamente no InsertCoin."});
    const read = path => fetch(base + path, {headers:{Authorization:bearer},signal:AbortSignal.timeout(8000)});
    const [squad, profile] = await Promise.all([read("squads/" + id),read("users/" + encodeURIComponent(uid))]);
    if (!squad.ok || !profile.ok) return res.status(403).json({error:"Sala indisponível para esta conta."});
    const members = (await squad.json()).fields?.members?.arrayValue?.values || [];
    if (!members.some(value => value.stringValue === uid)) return res.status(403).json({error:"Entre no squad para participar."});
    const user = (await profile.json()).fields;
    if (user.banned?.booleanValue) return res.status(403).json({error:"Conta indisponível."});
    const {LIVEKIT_API_KEY:key,LIVEKIT_API_SECRET:secret,LIVEKIT_PUBLIC_URL:url} = process.env;
    if (!key || !secret || !url) return res.status(503).json({error:"A sala de voz aguarda a conexão do servidor de chamadas."});
    const camera = req.body.settingsOnly ? await cameraEnabled() : await cameraEnabled().catch(()=>false);
    if (req.body.settingsOnly === true) return res.json({camera});
    const token = new AccessToken(key,secret,{identity:uid,name:user.nickname?.stringValue || "Jogador",ttl:"5m"});
    token.addGrant({roomJoin:true,room:"insertcoin-"+id,canSubscribe:true,canPublish:true,canPublishData:false,
      canPublishSources:sources(camera)});
    return res.json({url,camera,token:await token.toJwt()});
  } catch { return res.status(502).json({error:"Falha ao abrir a sala. Tente novamente."}); }
};
