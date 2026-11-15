import {requireAuth} from "./auth.js";
import {squadRequest,enterSquad} from "./squad-client.js";
import {comparison} from "./steam.js";
await requireAuth();
const id=new URLSearchParams(location.search).get("id");
const status=document.getElementById("room-status");
let permitted=false,loading=false;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
async function messages(){
 if(loading || !permitted || document.hidden)return;
 loading=true;
 try{
  const result=await squadRequest("messages",{id});
  const log=document.getElementById("messages");
  const nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
  log.replaceChildren(...result.messages.filter(m=>Date.now()-Date.parse(m.createdAt)<86400000).map(m=>{
   const item=node("article","");
   item.append(node("strong",m.nickname),node("time"," · "+new Date(m.createdAt).toLocaleString("pt-BR")),node("p",m.text));return item;
  }));
  if(nearBottom)log.scrollTop=log.scrollHeight;
 }catch(e){status.textContent=e.message;}finally{loading=false;}
}
try{
 const squad=await squadRequest("info",{id});
 document.getElementById("room-name").textContent=squad.name;
 status.textContent=(squad.isPrivate?"Privado":"Público")+" · "+squad.members.length+"/"+squad.maxPlayers+" membros";
 if(squad.code)document.getElementById("room-code").textContent="Código de entrada · "+squad.code+" · Compartilhe apenas com quem você quer convidar.";
 const actions=document.getElementById("room-actions");
 if(squad.member){
  permitted=true;
  const voice=node("a","Entrar na sala de voz");voice.className="btn btn-primary";voice.href="voice.html?squad="+encodeURIComponent(id);actions.append(voice);
  comparison(document.getElementById("common-games"),"Jogos em comum",()=>squad.members);
  document.getElementById("squad-chat").hidden=false;await messages();
 }else{
  const join=node("button",squad.isPrivate?"Entrar com código":"Participar");join.className="btn btn-primary";join.onclick=async()=>{try{await enterSquad(id);}catch(e){status.textContent=e.message;}};actions.append(join);
 }
}catch(e){status.textContent=e.message;}
document.getElementById("send-message").onsubmit=async e=>{
 e.preventDefault();const input=document.getElementById("message"),button=e.submitter;button.disabled=true;
 try{await squadRequest("send",{id,message:input.value});input.value="";await messages();}
 catch(e){status.textContent=e.message;}finally{button.disabled=false;}
};
setInterval(messages,5000);
