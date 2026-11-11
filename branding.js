const platforms={PC:"pc",PlayStation:"playstation",Xbox:"xbox",Nintendo:"switch","Nintendo Switch":"switch",Mobile:"mobile"};
function decorate(){
  for(const el of document.querySelectorAll(".platform-badge,#p-platform")){
    const key=platforms[el.textContent.trim()];
    if(!key || el.querySelector("img"))continue;
    const img=document.createElement("img");
    img.className="platform-icon";img.src="assets/"+key+".png";img.alt="";
    el.prepend(img);
  }
}
decorate();
new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true,characterData:true});
