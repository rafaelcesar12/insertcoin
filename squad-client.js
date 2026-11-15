import {auth} from "./firebase-config.js";
export async function squadRequest(action,data={}){
 const r=await fetch("/api/squad",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+await auth.currentUser.getIdToken()},body:JSON.stringify({action,...data})});
 const result=await r.json();
 if(!r.ok)throw Error(result.error||"Não foi possível acessar o squad.");
 return result;
}
export async function enterSquad(id){
 const info=await squadRequest("info",{id});
 if(!info.member){
  const code=info.isPrivate?prompt("Código de 4 dígitos fornecido pelo criador:"):undefined;
  if(code===null)return;
  await squadRequest("join",{id,code});
 }
 location.href="squad.html?id="+encodeURIComponent(id);
}
