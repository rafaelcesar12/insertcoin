const {base}=require("./platform");
async function documentRequest(bearer,path,method="GET",data,query="") {
  const response=await fetch(base+path+query,{method,headers:{Authorization:bearer,"Content-Type":"application/json"},body:data && JSON.stringify(data),signal:AbortSignal.timeout(8000)});
  if (!response.ok) throw Error("O Firebase recusou a operação.");
  return method==="DELETE"?null:response.json();
}
function value(x){
  if(Array.isArray(x))return {arrayValue:{values:x.map(value)}};
  if(typeof x==="number")return {integerValue:String(x)};
  if(typeof x==="boolean")return {booleanValue:x};
  if(x instanceof Date)return {timestampValue:x.toISOString()};
  return {stringValue:x};
}
function fields(obj){return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,value(v)]));}
async function update(bearer,id,obj){
  const query=new URLSearchParams({"currentDocument.exists":"true"});
  Object.keys(obj).forEach(k=>query.append("updateMask.fieldPaths",k));
  await documentRequest(bearer,"users/"+id,"PATCH",{fields:fields(obj)},"?"+query);
}
async function listSquads(bearer){
  const squads=[];
  let token="";
  do {
    const query=new URLSearchParams({pageSize:"300",pageToken:token});
    const page=await documentRequest(bearer,"squads","GET",null,"?"+query);
    for(const d of page.documents||[])squads.push({id:d.name.split("/").pop(),name:d.fields.name.stringValue,game:d.fields.game?.stringValue||""});
    token=page.nextPageToken;
  }while(token);
  return squads;
}
module.exports={documentRequest,fields,update,listSquads};
