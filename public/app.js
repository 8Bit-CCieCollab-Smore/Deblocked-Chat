const socket = io();
const qs = (s) => document.querySelector(s);
const intro = qs("#intro");
const introName = qs("#introName");
const introAvatar = qs("#introAvatar");
const introStart = qs("#introStart");
const app = qs("#app");
const feed = qs("#feed");
const typingEl = qs("#typing");
const onlineListEl = qs("#onlineList");
const onlineEl = qs("#onlineCount");
const bannerEl = qs("#banner");
const messageInput = qs("#messageInput");
const sendBtn = qs("#sendBtn");
const attachBtn = qs("#attachBtn");
const fileInput = qs("#fileInput");
const avatarPreview = qs("#avatarPreview");
const settingsBtn = qs("#settingsBtn");
const settingsDlg = qs("#settings");
const nameField = qs("#nameField");
const colorA = qs("#colorA");
const colorB = qs("#colorB");
const bannerColor = qs("#bannerColor");
const saveSettings = qs("#saveSettings");
const closeSettings = qs("#closeSettings");
const toggleTimestamps = qs("#toggleTimestamps");
const toggleStars = qs("#toggleStars");
const toggleAutoScroll = qs("#toggleAutoScroll");
const clearChatBtn = qs("#clearChat");

let me = {
  id: localStorage.getItem("userId") || crypto.randomUUID(),
  name: localStorage.getItem("name") || "",
  colorA: localStorage.getItem("colorA") || "#7b61ff",
  colorB: localStorage.getItem("colorB") || "#ad83ff",
  banner: localStorage.getItem("banner") || "#17161a",
  avatar: localStorage.getItem("avatar") || "",
};
let onlineUsers = new Map();
let whoTyping = new Map();

function applyTheme(){
  document.documentElement.style.setProperty("--accent-a", me.colorA);
  document.documentElement.style.setProperty("--accent-b", me.colorB);
  document.documentElement.style.setProperty("--banner", me.banner);
  bannerEl.style.background = me.banner;
}
applyTheme();

function scrollToBottom(){
  const near = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 120;
  if(near) feed.scrollTop = feed.scrollHeight;
}

function renderMessage(m){
  if(m.system){
    const s = document.createElement("div");
    s.className="system";
    s.textContent = m.text;
    feed.appendChild(s);
    scrollToBottom();
    return;
  }
  const msg = document.createElement("div"); msg.className="msg";
  const av = document.createElement("img");
  av.className="avatar"; av.src = m.user.avatar || "";
  av.onerror = ()=> av.style.display="none";
  msg.appendChild(av);

  const bubble=document.createElement("div"); bubble.className="bubble";
  const meta=document.createElement("div");
  const name=document.createElement("span"); name.className="name-tag"; name.textContent=m.user.name;
  const time=document.createElement("span"); time.className="time"; time.textContent=new Date(m.createdAt).toLocaleTimeString();
  meta.append(name,time);
  bubble.append(meta);
  if(m.text){const txt=document.createElement("div");txt.className="text";txt.textContent=m.text;bubble.append(txt);}
  if(m.attachment?.url){const img=document.createElement("img");img.src=m.attachment.url;img.loading="lazy";img.onerror=()=>img.remove();bubble.append(img);}
  msg.append(bubble); feed.append(msg); scrollToBottom();
}

/* socket listeners */
socket.on("history",(rows)=>{feed.innerHTML="";rows.forEach(renderMessage);});
socket.on("message:new",(m)=>renderMessage(m));
socket.on("presence:list",(list)=>{onlineUsers=new Map(list.map(u=>[u.id,u]));updateOnline();});
socket.on("presence:typing",({name,isTyping})=>{
  if(isTyping) whoTyping.set(name,name); else whoTyping.delete(name);
  typingEl.textContent=whoTyping.size?`${Array.from(whoTyping.keys()).join(", ")} typing…`:"";
  typingEl.classList.toggle("hidden",!whoTyping.size);
});
function updateOnline(){
  onlineListEl.innerHTML="";
  for(const u of onlineUsers.values()){
    const i=document.createElement("img");
    i.src=u.avatar||"";i.title=u.name;i.onerror=()=>i.style.display="none";
    onlineListEl.append(i);
  }
  onlineEl.textContent=`${onlineUsers.size} online`;
}

/* send */
sendBtn.onclick=()=>send();
messageInput.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();send();}};
function send(att){
  const text=messageInput.value.trim();
  if(!text && !att)return;
  socket.emit("message:send",{text,attachment:att},()=>{messageInput.value="";});
}

/* intro */
introStart.onclick=async()=>{
  const name=introName.value.trim(); if(!name)return alert("Enter name");
  me.name=name; localStorage.setItem("name",name);
  if(introAvatar.files[0]){
    const f=new FormData(); f.append("file",introAvatar.files[0]);
    const r=await fetch("/upload",{method:"POST",body:f}); const d=await r.json();
    if(d.url){me.avatar=d.url;localStorage.setItem("avatar",d.url);}
  }
  socket.emit("join",me,()=>{intro.remove();app.classList.remove("hidden");});
};

/* settings */
settingsBtn.onclick=()=>{nameField.value=me.name;settingsDlg.showModal();};
saveSettings.onclick=e=>{
  e.preventDefault();
  me.name=nameField.value;me.colorA=colorA.value;me.colorB=colorB.value;me.banner=bannerColor.value;
  for(const[k,v]of Object.entries(me))localStorage.setItem(k,v);
  applyTheme();
  socket.emit("settings:update",me,()=>{settingsDlg.close();});
};
closeSettings.onclick=()=>settingsDlg.close();
clearChatBtn.onclick=()=>{feed.innerHTML="";};

/* stars */
(function stars(){
  const c=document.getElementById("stars");const ctx=c.getContext("2d");let w,h,stars=[];
  function resize(){w=c.width=innerWidth;h=c.height=innerHeight;stars=Array.from({length:Math.floor(w*h/30000)},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()*1.4+0.2,dx:(Math.random()-0.5)*0.2,dy:(Math.random()-0.5)*0.2,a:Math.random()*0.8+0.2}));}
  function draw(){
    ctx.clearRect(0,0,w,h);
    for(const s of stars){
      s.x+=s.dx; s.y+=s.dy;
      if(s.x<0)s.x=w; if(s.x>w)s.x=0; if(s.y<0)s.y=h; if(s.y>h)s.y=0;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(255,255,255,${s.a})`; ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  resize();addEventListener("resize",resize);draw();
})();
