function adminServices() {
  const json=process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!json) throw Error("Configure FIREBASE_ADMIN_CREDENTIALS na Vercel para administrar contas de login.");
  const {initializeApp,getApps,cert}=require("firebase-admin/app");
  const {getAuth}=require("firebase-admin/auth");
  const {getFirestore}=require("firebase-admin/firestore");
  const credentials=JSON.parse(json);
  if(credentials.project_id!=="insert-coin-fa696") throw Error("Projeto Firebase incorreto.");
  const app=getApps()[0] || initializeApp({credential:cert(credentials)});
  return {auth:getAuth(app),db:getFirestore(app)};
}
module.exports={adminServices};
