const {identity,owner,cameraEnabled,setCamera} = require("../lib/platform");
const {adminServices}=require("../lib/firebase-admin");
const {documentRequest,fields,update,listSquads}=require("../lib/admin-documents");
module.exports=async function admin(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).end();
  try {
    const bearer=req.headers.authorization;
    const uid=await identity(bearer);
    if(!uid || uid!==owner)return res.status(403).json({error:"Acesso exclusivo do proprietário."});
    const {action,enabled,email,nickname,id,password}=req.body||{};
    if(action==="status")return res.json({enabled:await cameraEnabled(),accounts:!!process.env.FIREBASE_ADMIN_CREDENTIALS});
    if(action==="camera" && typeof enabled==="boolean") {await setCamera(enabled);return res.json({enabled});}
    if(id!==undefined && (typeof id!=="string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id))) return res.status(400).json({error:"Identificador inválido."});
    if(action==="xp" && typeof id==="string" && Number.isSafeInteger(req.body.xp) && req.body.xp>=0 && req.body.xp<=100000000) {
      await update(bearer,id,{xp:req.body.xp,level:Math.floor(req.body.xp/100)+1});
      return res.json({ok:true});
    }
    if(action==="role" && typeof id==="string" && typeof req.body.role==="string" && req.body.role.trim().length<=32) {
      await update(bearer,id,{role:req.body.role.trim()});
      return res.json({ok:true});
    }
    if(action==="squads"){
      return res.json({squads:await listSquads(bearer)});
    }
    if(action==="createSquad" && typeof req.body.name==="string" && req.body.name.trim() && req.body.name.length<=60) {
      const nick=(await documentRequest(bearer,"users/"+uid)).fields.nickname?.stringValue || "Admin";
      await documentRequest(bearer,"squads","POST",{fields:fields({ownerUid:uid,ownerNickname:nick,name:req.body.name.trim(),game:"A decidir",platform:"PC",description:"",maxPlayers:8,members:[uid],memberNicknames:[nick],status:"aberto",createdAt:new Date()})});
      return res.json({ok:true});
    }
    if(action==="deleteSquad" && typeof id==="string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id)){
      await documentRequest(bearer,"squads/"+id,"DELETE");
      const {RoomServiceClient}=require("livekit-server-sdk");
      const service=new RoomServiceClient(process.env.LIVEKIT_PUBLIC_URL,process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET);
      const name="insertcoin-"+id;
      if((await service.listRooms([name])).length)await service.deleteRoom(name);
      return res.json({ok:true});
    }
    if(action==="create" && typeof nickname==="string" && nickname.trim() && nickname.length<=32 && typeof password==="string" && password.length>=6){
      const {auth,db}=adminServices();
      const record=await auth.createUser({email,password,displayName:nickname.trim()});
      try {await db.collection("users").doc(record.uid).create({uid:record.uid,email:record.email,nickname:nickname.trim(),favoriteGames:[],mainPlatform:"",bio:"",xp:10,level:1,isAdmin:false,isOnline:false,badges:[],friends:[],friendRequests:[],createdAt:new Date()});}
      catch(e){await auth.deleteUser(record.uid);throw e;}
      return res.json({ok:true});
    }
    if(action==="delete" && typeof id==="string" && id!==owner && /^[\w-]{1,128}$/.test(id)){
      const {auth,db}=adminServices();
      const squads=db.collection("squads");
      if(!(await squads.where("ownerUid","==",id).limit(1).get()).empty)throw Error("Exclua ou transfira os squads deste usuário primeiro.");
      const {FieldValue}=require("firebase-admin/firestore");
      const users=db.collection("users");
      const profile=await users.doc(id).get();
      for(const field of ["friends","friendRequests"]){
        for(const doc of (await users.where(field,"array-contains",id).get()).docs) await doc.ref.update({[field]:FieldValue.arrayRemove(id)});
      }
      for(const doc of (await squads.where("members","array-contains",id).get()).docs){
        await db.runTransaction(async tx=>{
          const data=(await tx.get(doc.ref)).data();
          if(!data?.members.includes(id))return;
          const index=data.members.indexOf(id);
          tx.update(doc.ref,{members:data.members.filter(x=>x!==id),memberNicknames:(data.memberNicknames||[]).filter((_,i)=>i!==index),status:"aberto"});
        });
      }
      await auth.deleteUser(id).catch(e=>{if(e.code!=="auth/user-not-found")throw e;});
      if(profile.exists)await profile.ref.delete();
      return res.json({ok:true});
    }
    return res.status(400).json({error:"Ação inválida."});
  }catch(e){return res.status(400).json({error:e.message?.includes("Firebase")||e.message?.startsWith("Configure")||e.message?.startsWith("Exclua")?e.message:"Falha ao aplicar a alteração. Confira os dados e tente novamente."});}
};
