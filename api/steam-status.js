const web="https://api.steampowered.com/";
module.exports=async(req,res)=>{
  if(req.method!=="GET")return res.status(405).end();
  const checks=[["Loja Steam","https://store.steampowered.com/"],["Comunidade Steam","https://steamcommunity.com/"],["Steam Web API",web+"ISteamChartsService/GetMostPlayedGames/v1/"]];
  const items=await Promise.all(checks.map(async([name,url])=>{
    try{const r=await fetch(url,{signal:AbortSignal.timeout(6000)});return {name,state:r.ok?"Resposta normal":"Falha HTTP "+r.status};}
    catch{return {name,state:"Sem resposta nesta verificação"};}
  }));
  if(process.env.STEAM_WEB_API_KEY){
    try{
      const url=web+"ICSGOServers_730/GetGameServersStatus/v1/?key="+encodeURIComponent(process.env.STEAM_WEB_API_KEY);
      const r=await fetch(url,{signal:AbortSignal.timeout(6000)});
      if(r.ok){
        const data=(await r.json()).result;
        for(const [name,state] of Object.entries(data?.services||{}))items.push({name:"Counter-Strike · "+name,state:String(state)});
        for(const [name,region] of Object.entries(data?.datacenters||{}))items.push({name:"Counter-Strike · "+name,state:typeof region==="object"?Object.entries(region).map(([k,v])=>k+" "+v).join(" · "):String(region)});
      }
    }catch{}
  }
  res.setHeader("Cache-Control","public, s-maxage=60, max-age=30");
  res.json({items,checkedAt:new Date().toISOString()});
};
