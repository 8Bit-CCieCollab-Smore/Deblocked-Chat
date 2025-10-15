// Deblocked Chat V3 — client
const socket = io();

/* DOM helpers */
const qs = s => document.querySelector(s);
const feed = qs("#feed");
const typingEl = qs("#typing");
const bannerEl = qs("#banner");
const onlineCountEl = qs("#onlineCount");
const onlineListEl = qs("#onlineList");
const namesTickerInner = qs("#namesTickerInner");

const messageInput = qs("#messageInput");
const sendBtn = qs("#sendBtn");
const attachBtn = qs("#attachBtn");
const fileInput = qs("#fileInput");
const avatarInput = qs("#avatarInput");
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

/* Intro */
const intro = qs("#intro");
const introName = qs("#introName");
const introAvatar = qs("#introAvatar");
const introAvatarPreview = qs("#introAvatarPreview");
const introStart = qs("#introStart");

/* State */
let me = {
  id: localStorage.getItem("userId") || null,
  name: localStorage.getItem("name") || "",
  colorA: localStorage.getItem("colorA") || "#7b61ff",
  colorB: localStorage.getItem("colorB") || "#ad83ff",
  banner: localStorage.getItem("banner") || "#17161a",
  avatar: localStorage.getItem("avatar") || "",
};
let onlineUsers = new Map();
let whoTyping = new Map();
let chatMessages = [];

/* Utils */
const setCSS = (k, v) => document.documentElement.style.setProperty(k, v);
const applyNameGradient = (a, b) => { setCSS("--name-a", a); setCSS("--name-b", b); };
const applyBanner = hex => { setCSS("--banner", hex); bannerEl.style.background = hex; };
const timeShort = ts => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function makeAbsolute(url){
  if(!url) return url;
  if(url.startsWith("http")) return url;
  if(url.startsWith("//")) return location.protocol + url;
  if(url.startsWith("/")) return `${location.origin}${url}`;
  return `${location.origin}/${url}`;
}
function avatarFallback(name, size=80){
  const initials = (name||"U").split(/\s+/).map(s=>s[0]||"").slice(0,2).join("").toUpperCase();
  const a = me.colorA, b = me.colorB;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
      <defs><linearGradient id='g' x1='0' x2='1'>
        <stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/>
      </linearGradient></defs>
      <rect width='100%' height='100%' rx='12' fill='url(#g)'/>
      <text x='50%' y='55%' font-family='Inter, system-ui' font-size='${Math.floor(size/2)}'
            fill='#fff' text-anchor='middle' dominant-baseline='middle'>${initials}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
function scrollToBottom(force=false){
  const nearBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 140;
  const auto = localStorage.getItem("autoScroll") !== "false";
  if(force || nearBottom || auto) feed.scrollTop = feed.scrollHeight;
}

/* Renderers */
function renderSystem(text, ts=Date.now()){
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = localStorage.getItem("showTimestamps")==="true" ? `${text} • ${timeShort(ts)}` : text;
  feed.appendChild(div);
  chatMessages.push({ system:true, text, createdAt: ts });
  scrollToBottom();
}

function renderMessage(msg){
  if(msg.system) return renderSystem(msg.text, msg.createdAt);
  if(msg.attachment?.url) msg.attachment.url = makeAbsolute(msg.attachment.url);

  const mine = msg.user?.id === me.id;
  const wrap = document.createElement("div");
  wrap.className = `msg ${mine ? "me" : ""}`;

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.alt = msg.user?.name || "user";
  avatar.src = msg.user?.avatar ? makeAbsolute(msg.user.avatar) : avatarFallback(msg.user?.name || "User", 80);
  avatar.onerror = () => { avatar.src = avatarFallback(msg.user?.name || "User", 80); };
  wrap.appendChild(avatar);

  const bubble = document.createElement("div"); bubble.className = "bubble";
  const meta = document.createElement("div"); meta.className = "meta";

  const tag = document.createElement("span"); tag.className = "name-tag";
  const left = msg.user?.color || me.colorA;
  tag.style.background = `linear-gradient(135deg, ${left}, ${me.colorB})`;
  tag.textContent = msg.user?.name || "User";

  meta.appendChild(tag);
  if(localStorage.getItem("showTimestamps")==="true"){
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = timeShort(msg.createdAt);
    meta.appendChild(time);
  }
  bubble.appendChild(meta);

  if(msg.text){
    const text = document.createElement("div");
    text.className = "text";
    text.textContent = msg.text;
    bubble.appendChild(text);
  }

  if(msg.attachment?.url){
    const at = document.createElement("div"); at.className = "attachment";
    const img = document.createElement("img"); img.src = msg.attachment.url; img.alt = "attachment"; img.loading = "lazy";
    img.onerror = ()=>{ img.style.display="none"; const err = document.createElement("div"); err.className="system"; err.textContent="Image failed to load"; at.appendChild(err); };
    at.appendChild(img);
    bubble.appendChild(at);
  }

  wrap.appendChild(bubble);
  feed.appendChild(wrap);
  chatMessages.push(msg);
  scrollToBottom();
}

/* Online UI */
function renderOnline(){
  // avatars
  onlineListEl.innerHTML = "";
  const users = Array.from(onlineUsers.values());
  users.slice(0,12).forEach(u=>{
    const img = document.createElement("img");
    img.className = "avatar mini";
    img.alt = u.name;
    img.title = u.name;
    img.src = u.avatar ? makeAbsolute(u.avatar) : avatarFallback(u.name, 60);
    img.onerror = ()=> img.src = avatarFallback(u.name,60);
    onlineListEl.appendChild(img);
  });

  // names ticker (repeat so it scrolls seamlessly)
  const names = users.map(u=>u.name).join(" • ");
  namesTickerInner.innerText = names ? `${names} — ${names}` : "";
  onlineCountEl.textContent = `${users.length} online`;
}

/* Typing UI */
function updateTypingUI(){
  if(whoTyping.size===0){ typingEl.classList.add("hidden"); return; }
  const names = Array.from(whoTyping.values()).slice(0,3);
  typingEl.textContent = `${names.join(", ")} ${names.length>1?"are":"is"} typing…`;
  typingEl.classList.remove("hidden");
}

/* Socket events */
socket.on("presence:typing", ({ userId, name, isTyping })=>{
  if(userId === me.id) return;
  if(isTyping) whoTyping.set(userId, name);
  else whoTyping.delete(userId);
  updateTypingUI();
});

socket.on("presence:list", (list) => {
  onlineUsers = new Map(list.map(u => [u.id, u]));
  renderOnline();
});
socket.on("presence:user-joined", ({user}) => { onlineUsers.set(user.id,user); renderOnline(); renderSystem(`${user.name} joined`); });
socket.on("presence:user-left", ({userId, name}) => { onlineUsers.delete(userId); renderOnline(); renderSystem(`${name||"Someone"} left`); });
socket.on("presence:user-updated", ({user}) => { onlineUsers.set(user.id,user); renderOnline(); });

socket.on("history", (rows) => {
  feed.innerHTML = "";
  chatMessages = [];
  rows.forEach(r => renderMessage({
    id: r.id,
    user: { id: r.userId, name: r.name, color: r.color, avatar: r.avatar },
    text: r.text,
    attachment: r.attachment ? { url: r.attachment } : null,
    createdAt: r.createdAt
  }));
  scrollToBottom(true);
});
socket.on("message:new", (msg) => renderMessage(msg));

/* Input + send */
let typingTimer; let typingSent=false;
messageInput.addEventListener("input", ()=>{
  if(!typingSent){ typingSent = true; socket.emit("presence:typing", true); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(()=>{ typingSent=false; socket.emit("presence:typing", false); }, 900);
});
messageInput.addEventListener("keydown",(e)=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); }});
sendBtn.addEventListener("click", ()=> sendMessage());

function sendMessage(attachment=null){
  const text = messageInput.value.trim();
  if(!text && !attachment) return;
  socket.emit("message:send", { text, attachment }, (res)=> {
    if(res?.ok){ messageInput.value=""; socket.emit("presence:typing", false); }
    else renderSystem(`Message failed: ${res?.error || "unknown"}`);
  });
}

/* Attachments */
attachBtn.addEventListener("click", ()=> fileInput.click());
fileInput.addEventListener("change", async ()=>{
  const file = fileInput.files?.[0]; if(!file) return;
  if(!/^image\/(png|jpeg|gif|webp)$/.test(file.type)){ renderSystem("Unsupported file type"); fileInput.value=""; return; }
  if(file.size > 10 * 1024 * 1024){ renderSystem("File too large (max 10MB)"); fileInput.value=""; return; }
  try {
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/upload", { method:"POST", body: form });
    const data = await res.json(); if(!res.ok) throw new Error(data?.error || "Upload failed");
    sendMessage({ url: data.url });
  } catch(e){ renderSystem(`Upload error: ${e.message}`); } finally { fileInput.value=""; }
});

/* Avatar from composer */
avatarInput.addEventListener("change", async ()=>{
  const file = avatarInput.files?.[0]; if(!file) return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024){
    renderSystem("Avatar must be PNG/JPEG/WEBP up to 5MB"); avatarInput.value=""; return;
  }
  try{
    const form = new FormData(); form.append("file", file);
    const res = await fetch("/upload", { method:"POST", body: form });
    const data = await res.json(); if(!res.ok) throw new Error(data?.error || "Upload failed");
    me.avatar = data.url; localStorage.setItem("avatar", me.avatar);
    avatarPreview.src = makeAbsolute(me.avatar);
    socket.emit("settings:update", { avatar: me.avatar }, ()=>{});
  }catch(e){ renderSystem(`Avatar upload error: ${e.message}`); }
  finally{ avatarInput.value=""; }
});

/* Settings */
settingsBtn.addEventListener("click", ()=>{
  nameField.value = me.name;
  colorA.value = me.colorA;
  colorB.value = me.colorB;
  bannerColor.value = me.banner;
  toggleTimestamps.checked = localStorage.getItem("showTimestamps")==="true";
  toggleStars.checked = localStorage.getItem("starsEnabled")!=="false";
  toggleAutoScroll.checked = localStorage.getItem("autoScroll")!=="false";
  settingsDlg.showModal();
});
closeSettings.addEventListener("click", ()=> settingsDlg.close());
saveSettings.addEventListener("click", (e)=>{
  e.preventDefault();
  me.name = nameField.value.trim() || me.name;
  me.colorA = colorA.value; me.colorB = colorB.value; me.banner = bannerColor.value;
  localStorage.setItem("name", me.name);
  localStorage.setItem("colorA", me.colorA);
  localStorage.setItem("colorB", me.colorB);
  localStorage.setItem("banner", me.banner);
  localStorage.setItem("showTimestamps", toggleTimestamps.checked ? "true" : "false");
  localStorage.setItem("starsEnabled", toggleStars.checked ? "true" : "false");
  localStorage.setItem("autoScroll", toggleAutoScroll.checked ? "true" : "false");
  applyNameGradient(me.colorA, me.colorB); applyBanner(me.banner);
  socket.emit("settings:update", { name: me.name, color: me.colorA, avatar: me.avatar }, ()=>{});
  renderOnline();
  settingsDlg.close();
});
clearChatBtn.addEventListener("click", ()=>{ feed.innerHTML=""; chatMessages=[]; renderSystem("Chat cleared"); });

/* Intro flow */
introAvatar.addEventListener("change", async ()=>{
  const f = introAvatar.files?.[0]; if(!f) return;
  if(!/^image\/(png|jpeg|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024){
    renderSystem("Avatar must be PNG/JPEG/WEBP up to 5MB"); introAvatar.value=""; return;
  }
  introAvatarPreview.src = URL.createObjectURL(f);
});

introStart.addEventListener("click", async ()=>{
  const name = introName.value.trim();
  if(!name){ introName.focus(); return; }

  // optional avatar upload
  if(introAvatar.files?.[0]){
    try{
      const form = new FormData(); form.append("file", introAvatar.files[0]);
      const res = await fetch("/upload", { method:"POST", body: form });
      const data = await res.json(); if(!res.ok) throw new Error(data?.error || "Upload failed");
      me.avatar = data.url; localStorage.setItem("avatar", me.avatar);
    }catch(e){ renderSystem(`Avatar upload error: ${e.message}`); }
  }

  me.name = name;
  if(!me.id){ me.id = localStorage.getItem("userId") || self.crypto.randomUUID(); localStorage.setItem("userId", me.id); }
  localStorage.setItem("name", me.name);
  localStorage.setItem("colorA", me.colorA);
  localStorage.setItem("colorB", me.colorB);
  localStorage.setItem("banner", me.banner);

  applyNameGradient(me.colorA, me.colorB); applyBanner(me.banner);

  socket.emit("join", { id: me.id, name: me.name, color: me.colorA, avatar: me.avatar }, (res)=>{
    if(res?.ok){
      intro.style.display = "none";
      renderSystem("Connected");
      renderOnline();
    }else{
      renderSystem(`Join failed: ${res?.error || "unknown"}`);
    }
  });
});

/* Bootstrap */
(function init(){
  applyNameGradient(me.colorA, me.colorB);
  applyBanner(me.banner);
  avatarPreview.src = me.avatar ? makeAbsolute(me.avatar) : avatarFallback(me.name || "Guest", 96);
  avatarPreview.onerror = ()=> avatarPreview.src = avatarFallback(me.name||"Guest", 96);
  introName.value = me.name || "";
})();

/* Starfield engine */
(function starEngine(){
  const canvas = document.getElementById("stars"); if(!canvas) return;
  const ctx = canvas.getContext("2d"); let DPR=1, W=0, H=0, stars=[];
  const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
  function resize(){
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.width  = Math.floor(innerWidth * DPR);
    H = canvas.height = Math.floor(innerHeight * DPR);
    canvas.style.width  = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.setTransform(DPR,0,0,DPR,0,0);
    const density = Math.round((innerWidth*innerHeight)/42000);
    stars = new Array(density).fill(0).map(()=>({
      x: Math.random()*innerWidth,
      y: Math.random()*innerHeight,
      r: Math.random()*1.3+0.2,
      a: Math.random()*0.9+0.1,
      dx: (Math.random()-0.5)*0.05,
      dy: (Math.random()-0.5)*0.05,
      tw: Math.random()*0.02+0.004
    }));
  }
  function draw(){
    if(localStorage.getItem("starsEnabled")==="false"){ ctx.clearRect(0,0,innerWidth,innerHeight); requestAnimationFrame(draw); return; }
    ctx.clearRect(0,0,innerWidth,innerHeight);
    for(const s of stars){
      s.a = clamp(s.a + (Math.random()-0.5)*s.tw, 0.08, 1);
      s.x+=s.dx; s.y+=s.dy;
      if(s.x<0) s.x=innerWidth; if(s.x>innerWidth) s.x=0;
      if(s.y<0) s.y=innerHeight; if(s.y>innerHeight) s.y=0;
      const g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,6);
      g.addColorStop(0,`rgba(255,255,255,${s.a})`);
      g.addColorStop(0.4,`rgba(255,255,255,${s.a*0.28})`);
      g.addColorStop(1,`rgba(255,255,255,0)`);
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r*2,0,Math.PI*2); ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  addEventListener("resize", resize, { passive:true });
  resize(); draw();
})();
