import {auth} from "./firebase-config.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {getUserProfile} from "./firestore.js";
const page=location.pathname.split("/").pop()||"index.html";
if(!["voice.html","index.html","signup.html","home.html"].includes(page)){
 onAuthStateChanged(auth,async user=>{
  document.getElementById("site-navigation")?.remove();document.body.classList.remove("with-navigation");
  if(!user)return;
  const nav=document.createElement("nav");nav.id="site-navigation";nav.setAttribute("aria-label","Navegação principal");
  const links=[["home.html","Feed"],["profile.html","Meu perfil"],["friends.html","Amigos"],["squads.html","Squads"],["games.html","Jogos"],["eventos.html","Eventos"],["universo-steam.html","Universo Steam"]];
  const profile=await getUserProfile(user.uid).catch(()=>null);
  if(profile?.isAdmin)links.push(["admin.html","Admin"]);
  for(const [href,label] of links){const a=document.createElement("a");a.href=href;a.textContent=label;if(href===page)a.setAttribute("aria-current","page");nav.append(a);}
  document.body.classList.add("with-navigation");document.body.append(nav);
 });
}
