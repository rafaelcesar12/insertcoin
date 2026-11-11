export async function configurePanel(user, refreshUsers) {
  const panel=document.getElementById("platform-tools");
  const message=document.getElementById("platform-status");
  const camera=document.getElementById("enable-camera");
  async function call(action, data={}) {
    const response=await fetch("/api/platform-admin",{method:"POST",headers:{
      "Content-Type":"application/json",Authorization:"Bearer "+await user.getIdToken()
    },body:JSON.stringify({action,...data})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error || "Não foi possível concluir a operação.");
    return result;
  }
  let state;
  try { state=await call("status"); } catch { return; }
  panel.hidden=false;
  camera.checked=state.enabled;
  camera.disabled=!state.accounts;
  document.querySelector("#create-account button").disabled=!state.accounts;
  document.querySelector('#manage-account button[value="delete"]').disabled=!state.accounts;
  if(!state.accounts) message.textContent="Para gerenciar logins e liberar webcam, configure FIREBASE_ADMIN_CREDENTIALS na Vercel.";
  async function run(control,task) {
    control.disabled=true;
    try {await task();message.textContent="Alteração salva.";}
    catch(e){message.textContent=e.message;}
    finally{control.disabled=false;}
  }
  camera.onchange=()=>run(camera,async()=>{
    try {await call("camera",{enabled:camera.checked});} finally {camera.checked=(await call("status")).enabled;}
  });
  const create=document.getElementById("create-account");
  create.onsubmit=e=>{
    e.preventDefault();
    run(create.querySelector("button"),async()=>{
      await call("create",Object.fromEntries(new FormData(create)));create.reset();await refreshUsers();
    });
  };
  const squads=document.getElementById("manage-squads");
  async function loadSquads() {
    const result=await call("squads");
    squads.replaceChildren();
    for(const squad of result.squads){
      const row=document.createElement("li");
      row.textContent=squad.name+" · "+squad.game+" ";
      const button=document.createElement("button");
      button.type="button";button.className="btn btn-danger";button.textContent="Excluir squad";
      button.onclick=()=>{if(confirm("Excluir o squad "+squad.name+" e encerrar a sala?"))run(button,async()=>{await call("deleteSquad",{id:squad.id});await loadSquads();});};
      row.append(button);squads.append(row);
    }
    if(!squads.children.length)squads.textContent="Nenhum squad cadastrado.";
  }
  const createSquad=document.getElementById("create-squad");
  createSquad.onsubmit=e=>{
    e.preventDefault();run(createSquad.querySelector("button"),async()=>{
      await call("createSquad",Object.fromEntries(new FormData(createSquad)));createSquad.reset();await loadSquads();
    });
  };
  const manage=document.getElementById("manage-account");
  manage.onsubmit=e=>{
    e.preventDefault();
    const data=Object.fromEntries(new FormData(manage));
    const action=e.submitter.value;
    if(!data.id)return;
    if(action==="delete" && !confirm("Excluir definitivamente o login e o perfil de "+manage.elements.id.selectedOptions[0].textContent+"?"))return;
    if(action==="xp" && data.xp.trim()===""){message.textContent="Informe o total de XP.";return;}
    run(e.submitter,async()=>{
      await call(action,{id:data.id,xp:Number(data.xp),role:data.role});
      await refreshUsers();
    });
  };
  await loadSquads().catch(e=>{message.textContent=e.message;});
}
