import {Room,RoomEvent,Track} from "https://cdn.jsdelivr.net/npm/livekit-client@2.17.2/dist/livekit-client.esm.mjs";
import {requireAuth} from "./auth.js";
import {db} from "./firebase-config.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {screenCaptureOptions,switchScreen} from "./screen-share.js";

const el = id => document.getElementById(id);
const status = text => { el("status").textContent = text; };
const squad = new URLSearchParams(location.search).get("squad");
const user = await requireAuth();
const room = new Room();
let busy = false;
let allowed = false;
const media = new Map();
let watching=null;
el("open-devices").onclick=()=>el("device-dialog").showModal();
el("close-devices").onclick=()=>el("device-dialog").close();
function isScreen(pub){return pub.source===Track.Source.ScreenShare || pub.source===Track.Source.ScreenShareAudio;}

let cameraAllowed = false;
const kinds = ["audioinput","audiooutput","videoinput"];
const prefs = {};
for (const key of [...kinds,"noise"]) {
  try { prefs[key] = localStorage.getItem("voice."+key); } catch {}
}
function save(key,value) {
  prefs[key]=value;
  try { localStorage.setItem("voice."+key,value); } catch {}
}
el("noise").checked = prefs.noise !== "off";
function micOptions() {
  return {deviceId:el("audioinput").value || undefined, noiseSuppression:el("noise").checked,echoCancellation:true,autoGainControl:true};
}
async function devices() {
  const list=await navigator.mediaDevices.enumerateDevices();
  for (const kind of kinds) {
    const select=el(kind);
    const options=list.filter(d=>d.kind===kind && d.deviceId && d.deviceId!=="default");
    select.replaceChildren(new Option("Padrão do sistema",""));
    options.forEach((d,i)=>select.add(new Option(d.label || "Dispositivo "+(i+1),d.deviceId)));
    select.value=options.some(d=>d.deviceId===prefs[kind]) ? prefs[kind] : "";
  }
  el("audiooutput").disabled=typeof HTMLMediaElement.prototype.setSinkId!=="function";
  if(el("audiooutput").disabled) el("device-status").textContent="Neste navegador, escolha a saída de áudio nas configurações do sistema.";
}
el("devices").onclick=async()=>{
  try {
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getTracks().forEach(t=>t.stop());
    if(cameraAllowed) {
      const camera=await navigator.mediaDevices.getUserMedia({video:true});
      camera.getTracks().forEach(t=>t.stop());
    }
    el("device-status").textContent="Dispositivos atualizados.";
  } catch { el("device-status").textContent="Confira a permissão de acesso aos dispositivos no navegador."; }
  await devices().catch(()=>{});
};
for (const kind of kinds) el(kind).onchange=async()=>{
  const value=el(kind).value;
  try {
    if(room.state==="connected") await room.switchActiveDevice(kind,value || "default");
    save(kind,value);
  } catch { el(kind).value=prefs[kind] || ""; el("device-status").textContent="Não foi possível trocar o dispositivo."; }
};
el("noise").onchange=async()=>{
  try {
    const mic=room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if(mic && room.localParticipant.isMicrophoneEnabled)await mic.restartTrack(micOptions());
    save("noise",el("noise").checked?"on":"off");
  } catch { el("noise").checked=prefs.noise!=="off";el("device-status").textContent="Não foi possível alterar a redução de ruído."; }
};
navigator.mediaDevices?.addEventListener("devicechange",()=>devices().catch(()=>{}));
async function settings() {
  const response=await fetch("/api/voice",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+await user.getIdToken()},body:JSON.stringify({squad,settingsOnly:true})});
  if(response.ok)cameraAllowed=(await response.json()).camera===true;
  render();
}


function render() {
  const connected = room.state === "connected";
  const local = room.localParticipant;
  el("join").disabled = busy || !allowed || room.state !== "disconnected";
  for (const id of ["mic","share","switch","leave"]) el(id).disabled = busy || !connected;
  el("camera").hidden = !cameraAllowed;
  el("camera-select").hidden = !cameraAllowed;
  el("camera").disabled = busy || !connected;
  el("camera").textContent = local.isCameraEnabled ? "Desligar webcam" : "Ativar webcam";
  el("mic").textContent = local.isMicrophoneEnabled ? "Silenciar" : "Ativar microfone";
  el("share").textContent = local.isScreenShareEnabled ? "Parar transmissão" : "Compartilhar tela";
  el("switch").hidden = !connected || !local.isScreenShareEnabled;
  el("listen").hidden = !connected || room.canPlaybackAudio;
  const people = connected ? [local,...room.remoteParticipants.values()] : [];
  el("people").replaceChildren();
  if(watching!==local.identity && !room.remoteParticipants.get(watching)?.isScreenShareEnabled)watching=null;
  if(watching===local.identity && !local.isScreenShareEnabled)watching=null;
  el("broadcasts").replaceChildren();
  const active = new Set();
  for (const person of people) {
    const entry = document.createElement("li");
    entry.textContent = (person.name || "Jogador") + (person === local ? " (você)" : "") + (person.isMicrophoneEnabled ? "" : " · mudo");
    el("people").append(entry);
    if(person.isScreenShareEnabled){
      const button=document.createElement("button");
      button.className="broadcast";
      button.textContent=(person.name || "Jogador")+" · "+(watching===person.identity?"Parar de assistir":"Assistir");
      button.setAttribute("aria-pressed",String(watching===person.identity));
      button.onclick=()=>{watching=watching===person.identity?null:person.identity;render();};
      el("broadcasts").append(button);
    }
    for (const pub of person.trackPublications.values()) {
      if(person!==local)pub.setSubscribed(!isScreen(pub) || watching===person.identity);
      const track = pub.track;
      if (!track || (isScreen(pub) && watching!==person.identity) || (person === local && track.kind === Track.Kind.Audio)) continue;
      active.add(track);
      if (media.has(track)) continue;
      const player = track.attach();
      player.autoplay = true;
      let container = player;
      if (track.kind === Track.Kind.Video) {
        player.playsInline = true;
        player.controls = true;
        player.muted = true;
        container = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = (pub.source === Track.Source.Camera ? "Webcam de " : "Tela de ") + (person.name || "jogador");
        container.append(player,caption);
        el(pub.source===Track.Source.Camera ? "cameras" : "screen-stage").append(container);
      } else el("audio").append(player);
      media.set(track,{player,container});
    }
  }
  for (const [track,{player,container}] of media) {
    if (!active.has(track)) { track.detach(player); container.remove(); media.delete(track); }
  }
  el("empty").hidden = !!el("screen-stage").querySelector("video");
  el("streams").classList.toggle("watching",!!el("screen-stage").querySelector("video"));
}

for (const event of [RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackSubscribed,
  RoomEvent.TrackPublished,RoomEvent.TrackUnpublished,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,RoomEvent.AudioPlaybackStatusChanged]) room.on(event,render);
room.on(RoomEvent.ParticipantPermissionsChanged,(_previous,participant)=>{
  if(participant!==room.localParticipant)return;
  // LiveKit protocol TrackSource.CAMERA = 1.
  cameraAllowed=participant.permissions?.canPublishSources?.includes(1) === true;
  if(!cameraAllowed && participant.isCameraEnabled)participant.setCameraEnabled(false).catch(()=>{});
  render();
});
room.on(RoomEvent.Reconnecting,()=>{status("Reconectando…");render();});
room.on(RoomEvent.Reconnected,()=>{status("Conectado");render();});
room.on(RoomEvent.Disconnected,()=>{status("Fora da chamada");render();});

function action(id, run) {
  el(id).onclick = async () => {
    if (busy) return;
    busy = true;
    render();
    try { await run(); }
    catch (e) { status(e.name === "NotAllowedError" ? "Permissão de captura recusada ou seleção cancelada." : e.message || "Falha na chamada."); }
    finally { busy = false; render(); }
  };
}
action("join",async()=>{
  status("Entrando…");
  const response = await fetch("/api/voice",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+await user.getIdToken()},body:JSON.stringify({squad})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  cameraAllowed=data.camera===true;
  await room.connect(data.url,data.token,{autoSubscribe:false});
  if(el("audiooutput").value)await room.switchActiveDevice("audiooutput",el("audiooutput").value).catch(()=>{el("device-status").textContent="Usando a saída padrão do sistema.";});
  await room.startAudio();
  status("Conectado");
});
action("mic",()=>room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled,micOptions()));
action("camera",()=>room.localParticipant.setCameraEnabled(!room.localParticipant.isCameraEnabled,{deviceId:el("videoinput").value || undefined}));
action("share",()=>room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled,screenCaptureOptions));
action("switch",async()=>{const result=await switchScreen(room.localParticipant,{isActive:()=>room.state==="connected"});if(result.warning)status(result.warning);});
action("listen",()=>room.startAudio());
action("leave",()=>room.disconnect());
window.addEventListener("pagehide",()=>room.disconnect());
try {
  const data = squad && (await getDoc(doc(db,"squads",squad))).data();
  allowed = !!data?.members?.includes(user.uid);
  if (allowed) {
    el("squad-name").textContent = data.name;
    devices().catch(()=>{});
    settings().catch(()=>{});
  }
  status(allowed ? "Entre para ouvir. Ative o microfone quando quiser falar." : "Entre no squad para acessar a sala.");
} catch { status("Não foi possível consultar o squad."); }
render();
