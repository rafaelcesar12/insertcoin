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

function render() {
  const connected = room.state === "connected";
  const local = room.localParticipant;
  el("join").disabled = busy || !allowed || room.state !== "disconnected";
  for (const id of ["mic","share","switch","leave"]) el(id).disabled = busy || !connected;
  el("mic").textContent = local.isMicrophoneEnabled ? "Silenciar" : "Ativar microfone";
  el("share").textContent = local.isScreenShareEnabled ? "Parar transmissão" : "Compartilhar tela";
  el("switch").hidden = !connected || !local.isScreenShareEnabled;
  el("listen").hidden = !connected || room.canPlaybackAudio;
  const people = connected ? [local,...room.remoteParticipants.values()] : [];
  el("people").replaceChildren();
  const active = new Set();
  for (const person of people) {
    const entry = document.createElement("li");
    entry.textContent = (person.name || "Jogador") + (person === local ? " (você)" : "") + (person.isMicrophoneEnabled ? "" : " · mudo");
    el("people").append(entry);
    for (const pub of person.trackPublications.values()) {
      const track = pub.track;
      if (!track || (person === local && track.kind === Track.Kind.Audio)) continue;
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
        caption.textContent = "Tela de " + (person.name || "jogador");
        container.append(player,caption);
        el("streams").append(container);
      } else el("audio").append(player);
      media.set(track,{player,container});
    }
  }
  for (const [track,{player,container}] of media) {
    if (!active.has(track)) { track.detach(player); container.remove(); media.delete(track); }
  }
  el("empty").hidden = !!el("streams").querySelector("video");
}

for (const event of [RoomEvent.ParticipantConnected,RoomEvent.ParticipantDisconnected,RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,RoomEvent.AudioPlaybackStatusChanged]) room.on(event,render);
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
  await room.connect(data.url,data.token);
  await room.startAudio();
  status("Conectado");
});
action("mic",()=>room.localParticipant.setMicrophoneEnabled(!room.localParticipant.isMicrophoneEnabled));
action("share",()=>room.localParticipant.setScreenShareEnabled(!room.localParticipant.isScreenShareEnabled,screenCaptureOptions));
action("switch",async()=>{const result=await switchScreen(room.localParticipant,{isActive:()=>room.state==="connected"});if(result.warning)status(result.warning);});
action("listen",()=>room.startAudio());
action("leave",()=>room.disconnect());
window.addEventListener("pagehide",()=>room.disconnect());
try {
  const data = squad && (await getDoc(doc(db,"squads",squad))).data();
  allowed = !!data?.members?.includes(user.uid);
  if (allowed) el("squad-name").textContent = data.name;
  status(allowed ? "Entre para ouvir. Ative o microfone quando quiser falar." : "Entre no squad para acessar a sala.");
} catch { status("Não foi possível consultar o squad."); }
render();
