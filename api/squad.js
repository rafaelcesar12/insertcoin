const {randomInt,randomUUID,createHmac,createCipheriv,createDecipheriv,randomBytes,createHash}=require("node:crypto");
const {identity}=require("../lib/platform");
const {adminServices}=require("../lib/firebase-admin");
const secret=()=>process.env.LIVEKIT_API_SECRET;
const sign=(...parts)=>createHmac("sha256",secret()).update(JSON.stringify(parts)).digest("hex");
function encrypt(value){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",createHash("sha256").update(secret()).digest(),iv);
 return Buffer.concat([iv,cipher.update(value),cipher.final(),cipher.getAuthTag()]).toString("base64");
}
function decrypt(value){
 const data=Buffer.from(value,"base64"),cipher=createDecipheriv("aes-256-gcm",createHash("sha256").update(secret()).digest(),data.subarray(0,12));
 cipher.setAuthTag(data.subarray(-16));return Buffer.concat([cipher.update(data.subarray(12,-16)),cipher.final()]).toString();
}
function admitted(squad,id,uid){
 return !id.startsWith("p_") || decrypt(squad.policy)===uid || squad.admissions?.[uid]===sign("member",id,uid);
}
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).end();
 try{
  const uid=await identity(req.headers.authorization);
  if(!uid)return res.status(401).json({error:"Entre novamente."});
  const {db}=await adminServices();
  const profile=(await db.collection("users").doc(uid).get()).data();
  if(!profile || profile.banned)return res.status(403).json({error:"Conta indisponível."});
  const {action,id,code,message,data}=req.body||{};
  if(action==="create"){
   if(!data || typeof data.name!=="string" || !data.name.trim() || data.name.length>60 || ![2,3,4,5,6,8,10].includes(Number(data.maxPlayers)))return res.status(400).json({error:"Confira os dados do squad."});
   const ref=data.isPrivate===true ? db.collection("squads").doc("p_"+randomUUID().replaceAll("-","")) : db.collection("squads").doc();
   const pin=String(randomInt(0,10000)).padStart(4,"0");
   await ref.create({name:data.name.trim(),game:String(data.game||"A decidir").slice(0,120),platform:String(data.platform||"PC").slice(0,40),description:String(data.description||"").slice(0,200),maxPlayers:Number(data.maxPlayers),ownerUid:uid,ownerNickname:profile.nickname,members:[uid],memberNicknames:[profile.nickname],status:"aberto",isPrivate:data.isPrivate===true,policy:encrypt(uid),privateCode:encrypt(pin),codeProof:sign("code",ref.id,pin),admissions:{},createdAt:new Date()});
   return res.json({id:ref.id});
  }
  if(typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))return res.status(400).json({error:"Squad inválido."});
  const ref=db.collection("squads").doc(id);
  const snapshot=await ref.get(),squad=snapshot.data();
  if(!squad)return res.status(404).json({error:"Squad não encontrado."});
  if(action==="join"){
   const result=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data();
    if(!current)return {error:"Squad excluído."};
    if(current.members?.includes(uid)&&admitted(current,id,uid))return {};
    const lock=db.collection("squadAttempts").doc(id+"_"+uid);
    const attempt=(await tx.get(lock)).data();
    if(attempt?.until?.toMillis()>Date.now())return {error:"Muitas tentativas. Aguarde 15 minutos."};
    if(id.startsWith("p_") && (!/^\d{4}$/.test(code||"") || current.codeProof!==sign("code",id,code))){
     const failures=(attempt?.failures||0)+1;
     tx.set(lock,{failures:failures%5,until:new Date(failures>=5?Date.now()+900000:0)});
     return {error:"Código incorreto."};
    }
    if(current.members.length>=current.maxPlayers)return {error:"Squad cheio."};
    tx.update(ref,{members:[...current.members.filter(x=>x!==uid),uid],memberNicknames:[...(current.memberNicknames||[]),profile.nickname],["admissions."+uid]:sign("member",id,uid),status:current.members.length+1>=current.maxPlayers?"cheio":"aberto"});
    tx.delete(lock);return {};
   });
   return result.error?res.status(400).json(result):res.json({ok:true});
  }
  const member=squad.members?.includes(uid)&&admitted(squad,id,uid);
  if(action==="info")return res.json({id,...Object.fromEntries(Object.entries(squad).filter(([k])=>!["policy","privateCode","codeProof","admissions","createdAt"].includes(k))),isPrivate:id.startsWith("p_"),member,code:id.startsWith("p_")&&decrypt(squad.policy)===uid?decrypt(squad.privateCode):undefined});
  if(!member)return res.status(403).json({error:"Entre no squad para acessar o chat."});
  const messages=ref.collection("chat");
  if(action==="send"){
   if(typeof message!=="string" || !message.trim() || message.length>2000)return res.status(400).json({error:"Escreva uma mensagem de até 2000 caracteres."});
   const createdAt=new Date(),expiresAt=new Date(Date.now()+86400000);
   await messages.add({payload:encrypt(JSON.stringify({uid,nickname:profile.nickname,text:message.trim(),createdAt:createdAt.toISOString()})),createdAt,expiresAt});
   return res.json({ok:true});
  }
  if(action==="messages"){
   const cutoff=new Date(Date.now()-86400000);
   const expired=await messages.where("createdAt","<=",cutoff).limit(100).get();
   if(!expired.empty){const batch=db.batch();expired.docs.forEach(d=>batch.delete(d.ref));await batch.commit();}
   const list=await messages.where("createdAt",">",cutoff).orderBy("createdAt","desc").limit(100).get();
   return res.json({messages:list.docs.reverse().flatMap(d=>{try{return [{id:d.id,...JSON.parse(decrypt(d.get("payload")))}]}catch{return []}})});
  }
  res.status(400).json({error:"Ação inválida."});
 }catch{return res.status(502).json({error:"Não foi possível concluir. Tente novamente."});}
};
module.exports.admitted=admitted;
