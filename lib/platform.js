const {adminServices}=require("./firebase-admin");
const {TrackSource,RoomServiceClient} = require("livekit-server-sdk");
const base = "https://firestore.googleapis.com/v1/projects/insert-coin-fa696/databases/(default)/documents/";
const key = "AIzaSyCNDgP0z8hUi1w47tVxkUKMD0Hxq2Psnaw";
const owner = "cubbzei5Q5R3nLlf7lScM5SPyTv2";
async function identity(bearer) {
  if (!bearer?.startsWith("Bearer ")) return null;
  const response = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key="+key,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:bearer.slice(7)}),signal:AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  return (await response.json()).users?.[0]?.localId;
}
async function cameraEnabled() {
  if (!process.env.FIREBASE_ADMIN_CREDENTIALS) return false;
  const {auth}=await adminServices();
  return (await auth.getUser(owner)).customClaims?.insertcoinCamera === true;
}
function sources(enabled) {
  const list = [TrackSource.MICROPHONE,TrackSource.SCREEN_SHARE,TrackSource.SCREEN_SHARE_AUDIO];
  if (enabled) list.push(TrackSource.CAMERA);
  return list;
}
async function setCamera(enabled) {
  const {auth}=await adminServices();
  const current=await auth.getUser(owner);
  await auth.setCustomUserClaims(owner,{...current.customClaims,insertcoinCamera:enabled});
  const service=new RoomServiceClient(process.env.LIVEKIT_PUBLIC_URL.replace(/^wss:/,"https:"),process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET);
  for (const room of await service.listRooms()) {
    if (!room.name.startsWith("insertcoin-")) continue;
    for (const participant of await service.listParticipants(room.name)) {
      await service.updateParticipant(room.name,participant.identity,{permission:{canPublish:true,canSubscribe:true,canPublishData:false,canPublishSources:sources(enabled)}});
    }
  }
}
module.exports={identity,owner,base,cameraEnabled,setCamera,sources};
