// public/app.js (module)
const socket = io(); // socket.io client provided by server

/* DOM */
const qs = (s) => document.querySelector(s);
const feed = qs("#feed");
const typingEl = qs("#typing");
const onlineEl = qs("#onlineCount");
const onlineListEl = qs("#onlineList");
const bannerEl = qs("#banner");

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

/* Utilities */
function applyNameGradient(a,b){ document.documentElement.style.setProperty("--name-a", a); document.documentElement.style.setProperty("--name-b", b); }
function applyBanner(hex){ document.documentElement.style.setProperty("--banner", hex); bannerEl.style.background = hex; }
function timeShort(ts){ const d = new Date(ts); return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function makeAbsolute(url){ if(!url) return url; if(url.startsWith("http")) return url; if(url.startsWith("//")) return location.protocol + url; if(url.startsWith("/")) return `${location.origin}${url}`; return `${location.origin}/${url}`; }
function avatarFallback(name, size=80){ const initials = (name||"U").split(" ").map(s=>s[0]||"").slice(0,2).join("").toUpperCase(); const a = me.colorA || "#7b61ff"; const b = me.colorB || "#ad83ff"; const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/></linearGradient></defs><rect width='100%' height='100%' rx='12' fill='url(#g)'/><text x='50%' y='55%' font-family='Inter, system-ui' font-size='${Math.floor(size/2)}' fill='#fff' text-anchor='middle' dominant-baseline='middle'>${initials}</text></svg>`; return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`; }
function scrollToBottom(force=false){ const nearBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 140; if(nearBottom || force || localStorage.getItem("autoScroll")==="true") feed.scrollTop = feed.scrollHeight; }

/* Render */
function renderSystem(text, ts=Date.now()){
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = `${text} • ${timeShort(ts)}`;
  feed.appendChild(div);
  chatMessages.push({ system:true, text, createdAt: ts });
  scrollToBottom();
}

function renderMessage(msg){
  if(msg.system) return renderSystem(msg.text, msg.createdAt);
  if(msg.attachment?.url) msg.attachment.url = makeAbsolute(msg.attachment.url);

  const mine = msg.user && msg.user.id === me.id;
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
  tag.style.background = `linear-gradient(135deg, ${msg.user.color || me.colorA}, ${msg.user.color ? me.colorB : me.colorB})`;
  tag.textContent = msg.user.name;
  const time = document.createElement("span"); time.className = "time"; time.textContent = timeShort(msg.createdAt);
  meta.appendChild(tag);
  if(localStorage.getItem("showTimestamps")==="true") meta.appendChild(time);

  const text = document.createElement("div"); text.className = "text"; text.textContent = msg.text || "";
  bubble.appendChild(meta);
  if(msg.text) bubble.appendChild(text);

  if(msg.attachment?.url) {
    const at = document.createElement("div"); at.className = "attachment";
    const img = document.createElement("img"); img.src = msg.attachment.url; img.alt = "attachment"; img.loading="lazy";
    img.onerror = ()=>{ img.style.display="none"; const err = document.createElement("div"); err.className="system"; err.textContent="Image failed to load"; at.appendChild(err); };
    at.appendChild(img); bubble.appendChild(at);
  }

  wrap.appendChild(bubble);
  feed.appendChild(wrap);
  chatMessages.push(msg);
  scrollToBottom();
}

/* Online list */
function renderOnlineList(){
  onlineListEl.innerHTML = "";
  Array.from(onlineUsers.values()).slice(0,10).forEach(u=>{
    const img = document.createElement("img"); img.className="mini"; img.alt=u.name; img.src = u.avatar ? makeAbsolute(u.avatar) : avatarFallback(u.name,60);
    img.onerror = ()=> img.src = avatarFallback(u.name,60);
    img.title = u.name;
    onlineListEl.appendChild(img);
  });
  onlineEl.textContent = `${onlineUsers.size} online`;
}

/* Typing */
socket.on("presence:typing", ({ userId, name, isTyping })=>{
  if(userId === me.id) return;
  if(isTyping) whoTyping.set(userId, name);
  else whoTyping.delete(userId);
  updateTypingUI();
});
function updateTypingUI(){ if(whoTyping.size===0) return typingEl.classList.add("hidden"); const names = Array.from(whoTyping.values()).slice(0,3); typingEl.textContent = `${names.join(", ")} ${names.length>1?"are":"is"} typing…`; typingEl.classList.remove("hidden"); }

/* Presence */
socket.on("presence:list", (list) => {
  onlineUsers = new Map(list.map(u => [u.id, u]));
  renderOnlineList();
});
socket.on("presence:user-joined", ({user}) => { onlineUsers.set(user.id,user); renderOnlineList(); renderSystem(`${user.name} joined`); });
socket.on("presence:user-left", ({userId, name}) => { onlineUsers.delete(userId); renderOnlineList(); renderSystem(`${name||"Someone"} left`); });
socket.on("presence:user-updated", ({user}) => { onlineUsers.set(user.id,user); renderOnlineList(); });

/* History and new messages */
socket.on("history", (rows) => {
  feed.innerHTML = "";
  chatMessages = [];
  rows.forEach(r => renderMessage({
    id: r.id, user: { id: r.userId, name: r.name, color: r.color, avatar: r.avatar }, text: r.text, attachment: r.attachment ? { url: r.attachment } : null, createdAt: r.createdAt
  }));
});
socket.on("message:new", (msg) => renderMessage(msg));

/* Input */
let typingTimer; let typingSent=false;
messageInput.addEventListener("input", ()=>{
  if(!typingSent){ typingSent = true; socket.emit("presence:typing", true); }
  clearTimeout(typingTimer); typingTimer = setTimeout(()=>{ typingSent=false; socket.emit("presence:typing", false); }, 900);
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

/* Avatar upload (composer) */
avatarInput.addEventListener("change", async ()=>{
  const file = avatarInput.files?.[0]; if(!file) return;
  if(!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024){ renderSystem("Avatar must be PNG/JPEG/WEBP up to 5MB"); avatarInput.value=""; return; }
  const form = new FormData(); form.append("file", file);
  try {
    const res = await fetch("/upload", { method:"POST", body: form });
    const data = await res.json(); if(!res.ok) throw new Error(data?.error || "Upload failed");
    me.avatar = data.url; localStorage.setItem("avatar", me.avatar); avatarPreview.src = makeAbsolute(me.avatar);
    socket.emit("settings:update", { avatar: me.avatar }, ()=>{});
  } catch(e){ renderSystem(`Avatar upload error: ${e.message}`); } finally { avatarInput.value=""; }
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
saveSettings.addEventListener("click", (e)=> {
  e.preventDefault();
  me.name = nameField.value.trim() || me.name;
  me.colorA = colorA.value; me.colorB = colorB.value; me.banner = bannerColor.value;
  localStorage.setItem("name", me.name); localStorage.setItem("colorA", me.colorA); localStorage.setItem("colorB", me.colorB); localStorage.setItem("banner", me.banner);
  localStorage.setItem("showTimestamps", toggleTimestamps.checked ? "true" : "false");
  localStorage.setItem("starsEnabled", toggleStars.checked ? "true" : "false");
  localStorage.setItem("autoScroll", toggleAutoScroll.checked ? "true" : "false");
  applyNameGradient(me.colorA, me.colorB); applyBanner(me.banner);
  socket.emit("settings:update", { name: me.name, color: me.colorA, avatar: me.avatar }, ()=>{});
  settingsDlg.close();
});
clearChatBtn.addEventListener("click", ()=> { feed.innerHTML=""; chatMessages=[]; renderSystem("Chat cleared"); });

/* Intro flow: upload avatar optionally, set name, then join */
introStart.addEventListener("click", async () => {
  const name = introName.value.trim();
  if(!name){ introName.focus(); return; }
  // optionally upload avatar
  if(introAvatar.files?.[0]) {
    const f = introAvatar.files[0];
    const form = new FormData(); form.append("file", f);
    try {
      const res = await fetch("/upload", { method:"POST", body: form });
      const data = await res.json(); if(!res.ok) throw new Error(data?.error || "Upload failed");
      me.avatar = data.url; localStorage.setItem("avatar", me.avatar);
    } catch(e){ renderSystem(`Avatar upload error: ${e.message}`); }
  }
  me.name = name;
  if(!me.id) { me.id = localStorage.getItem("userId") || self.crypto.randomUUID(); localStorage.setItem("userId", me.id); }
  localStorage.setItem("name", me.name);
  localStorage.setItem("colorA", me.colorA); localStorage.setItem("colorB", me.colorB); localStorage.setItem("banner", me.banner);
  applyNameGradient(me.colorA, me.colorB); applyBanner(me.banner);
  // send join
  socket.emit("join", { id: me.id, name: me.name, color: me.colorA, avatar: me.avatar }, (res) => {
    if(res?.ok){ intro.style.display = "none"; renderSystem("Connected"); }
  });
});

/* bootstrap UI */
(function bootstrap(){
  applyNameGradient(me.colorA, me.colorB); applyBanner(me.banner);
  avatarPreview.src = me.avatar ? makeAbsolute(me.avatar) : avatarFallback(me.name || "Guest", 96);
  avatarPreview.onerror = ()=> avatarPreview.src = avatarFallback(me.name||"Guest", 96);
  introName.value = me.name || "";
})();

/* Stars background (lightweight) */
(function starEngine(){
  const canvas = document.getElementById("stars"); if(!canvas) return;
  const ctx = canvas.getContext("2d"); let w,h,stars=[];
  function resize(){ const DPR = Math.min(2, devicePixelRatio || 1); w=canvas.width=innerWidth*DPR; h=canvas.height=innerHeight*DPR; canvas.style.width=innerWidth+"px"; canvas.style.height=innerHeight+"px"; ctx.setTransform(DPR,0,0,DPR,0,0); stars = createStars(Math.round((innerWidth*innerHeight)/42000)); }
  function createStars(n){ const arr=[]; for(let i=0;i<n;i++){ arr.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.2+0.2,a:Math.random()*0.9+0.1,dx:(Math.random()-0.5)*0.04,dy:(Math.random()-0.5)*0.04,twinkle:Math.random()*0.02+0.005}); } return arr; }
  function draw(){ if(localStorage.getItem("starsEnabled")==="false"){ ctx.clearRect(0,0,innerWidth,innerHeight); requestAnimationFrame(draw); return; } ctx.clearRect(0,0,innerWidth,innerHeight); ctx.fillStyle="rgba(0,0,0,0.14)"; ctx.fillRect(0,0,innerWidth,innerHeight); for(const s of stars){ s.a += (Math.random()-0.5)*s.twinkle; if(s.a<0.1) s.a=0.1; if(s.a>1) s.a=1; s.x+=s.dx; s.y+=s.dy; if(s.x<0) s.x=innerWidth; if(s.x>innerWidth) s.x=0; if(s.y<0) s.y=innerHeight; if(s.y>innerHeight) s.y=0; const g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,6); g.addColorStop(0,`rgba(255,255,255,${s.a})`); g.addColorStop(0.4,`rgba(255,255,255,${s.a*0.28})`); g.addColorStop(1,`rgba(255,255,255,0)`); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(s.x,s.y,s.r*2,0,Math.PI*2); ctx.fill(); } requestAnimationFrame(draw); }
  addEventListener("resize", resize); resize(); draw();
})();
