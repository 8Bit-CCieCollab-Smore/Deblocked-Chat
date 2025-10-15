// public/app.js (module)
import ioClient from "/socket.io/socket.io.js"; // socket.io served by server
const socket = ioClient();

/* ---------- DOM shortcuts ---------- */
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

const settingsBtn = qs("#settingsBtn");
const settingsDlg = qs("#settings");
const nameField = qs("#nameField");
const colorA = qs("#colorA");
const colorB = qs("#colorB");
const themeSelect = qs("#themeSelect");
const bannerColor = qs("#bannerColor");
const saveSettings = qs("#saveSettings");
const closeSettings = qs("#closeSettings");
const previewName = qs("#previewName");
const previewDot = qs("#previewDot");
const toggleTimestamps = qs("#toggleTimestamps");
const toggleStars = qs("#toggleStars");
const downloadChatBtn = qs("#downloadChat");
const clearChatBtn = qs("#clearChat");
const avatarInput = qs("#avatarInput");
const avatarPreview = qs("#avatarPreview");

let me = {
  name: localStorage.getItem("name") || "Guest",
  colorA: localStorage.getItem("colorA") || "#7b61ff",
  colorB: localStorage.getItem("colorB") || "#ad83ff",
  banner: localStorage.getItem("banner") || "#17161a",
  theme: localStorage.getItem("theme") || "gray",
  avatar: localStorage.getItem("avatar") || "",
};

let chatMessages = []; // in-memory chat store for download/clear
let onlineUsers = new Map(); // id -> user
let whoTyping = new Map();

/* ---------- Apply persisted visuals ---------- */
applyNameGradient(me.colorA, me.colorB);
applyTheme(me.theme);
applyBanner(me.banner);
if (me.avatar) avatarPreview.src = makeAbsolute(me.avatar);

/* ---------- Helpers ---------- */
function applyNameGradient(a, b) {
  document.documentElement.style.setProperty("--name-a", a);
  document.documentElement.style.setProperty("--name-b", b);
  previewName.style.background = `linear-gradient(135deg, ${a}, ${b})`;
}
function applyBanner(hex) { document.documentElement.style.setProperty("--banner", hex); bannerEl.style.background = hex; }
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-violet","theme-ocean","theme-emerald","theme-sunset","theme-void");
  if (theme === "violet") root.classList.add("theme-violet");
  else if (theme === "ocean") root.classList.add("theme-ocean");
  else if (theme === "emerald") root.classList.add("theme-emerald");
  else if (theme === "sunset") root.classList.add("theme-sunset");
  else if (theme === "void") root.classList.add("theme-void");
}

/* ensure relative url attachments are absolute so images load cross-device */
function makeAbsolute(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return location.protocol + url;
  if (url.startsWith("/")) return `${location.origin}${url}`;
  return `${location.origin}/${url}`;
}

/* fallback avatar generation (SVG data URI with initials) */
function avatarFallback(name, width = 80) {
  const initials = (name || "U").split(" ").map(s => s[0] || "").slice(0,2).join("").toUpperCase();
  const gradA = me.colorA || "#7b61ff";
  const gradB = me.colorB || "#ad83ff";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${width}'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='${gradA}'/><stop offset='1' stop-color='${gradB}'/></linearGradient></defs><rect width='100%' height='100%' rx='12' fill='url(#g)'/><text x='50%' y='55%' font-family='Inter, system-ui, Roboto, Arial' font-size='${Math.floor(width/2)}' fill='#fff' text-anchor='middle' dominant-baseline='middle'>${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* generate time string */
function timeShort(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function scrollToBottom(force = false) {
  const nearBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 140;
  if (nearBottom || force || localStorage.getItem("autoScroll") === "true") feed.scrollTop = feed.scrollHeight;
}

/* ---------- Rendering ---------- */
function renderSystem(text, ts = Date.now()) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = `${text} • ${timeShort(ts)}`;
  feed.appendChild(div);
  chatMessages.push({ system: true, text, createdAt: ts });
  scrollToBottom();
}

function renderMessage(msg) {
  if (msg.system) return renderSystem(msg.text, msg.createdAt);
  // normalize attachments to absolute URLs
  if (msg.attachment?.url) msg.attachment.url = makeAbsolute(msg.attachment.url);

  const mine = msg.user && msg.user.id === socket.id;
  const wrap = document.createElement("div");
  wrap.className = `msg ${mine ? "me" : ""}`;

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = msg.user?.avatar ? makeAbsolute(msg.user.avatar) : avatarFallback(msg.user?.name || "User", 80);
  // onerror fallback to data svg
  avatar.onerror = () => { avatar.src = avatarFallback(msg.user?.name || "User", 80); };

  wrap.appendChild(avatar);

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";

  const tag = document.createElement("span");
  tag.className = "name-tag";
  tag.style.background = `linear-gradient(135deg, ${msg.user.color || me.colorA}, ${msg.user.color ? me.colorB : me.colorB})`;
  const dot = document.createElement("span");
  dot.className = "pill";
  const name = document.createElement("span");
  name.textContent = msg.user.name;
  tag.appendChild(dot);
  tag.appendChild(name);

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = timeShort(msg.createdAt);

  meta.appendChild(tag);
  if (localStorage.getItem("showTimestamps") === "true") meta.appendChild(time);

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = msg.text || "";

  bubble.appendChild(meta);
  if (msg.text) bubble.appendChild(text);

  if (msg.attachment?.url) {
    const at = document.createElement("div");
    at.className = "attachment";
    const img = document.createElement("img");
    img.src = msg.attachment.url;
    img.alt = "attachment";
    img.loading = "lazy";
    // fallback if image fails
    img.onerror = () => {
      img.style.display = "none";
      const err = document.createElement("div");
      err.className = "system";
      err.textContent = "Image failed to load";
      at.appendChild(err);
    };
    at.appendChild(img);
    bubble.appendChild(at);
  }

  wrap.appendChild(bubble);
  feed.appendChild(wrap);

  // push to in-memory store
  chatMessages.push(msg);
  scrollToBottom();
}

/* ---------- Online list UI ---------- */
function renderOnlineList() {
  onlineListEl.innerHTML = "";
  const users = Array.from(onlineUsers.values()).slice(0, 10);
  users.forEach(u => {
    const img = document.createElement("img");
    img.className = "mini";
    img.alt = u.name;
    img.src = u.avatar ? makeAbsolute(u.avatar) : avatarFallback(u.name, 60);
    img.title = u.name;
    img.onerror = () => { img.src = avatarFallback(u.name, 60); };
    onlineListEl.appendChild(img);
  });
  onlineEl.textContent = `${onlineUsers.size} online`;
}

/* ---------- Socket events ---------- */
socket.on("connect", () => {
  socket.emit("join", { name: me.name, color: me.colorA, banner: me.banner, avatar: me.avatar }, (res) => {
    if (!res?.ok) return;
    // populate online map
    (res.online || []).forEach(u => onlineUsers.set(u.id, u));
    renderOnlineList();
    renderSystem("Connected");
  });
});

socket.on("message:new", (msg) => {
  renderMessage(msg);
});

socket.on("presence:user-joined", ({ user }) => {
  onlineUsers.set(user.id, user);
  renderOnlineList();
  renderSystem(`${user.name} joined`);
});

socket.on("presence:user-left", ({ userId, name }) => {
  onlineUsers.delete(userId);
  renderOnlineList();
  renderSystem(`${name || "Someone"} left`);
});

socket.on("presence:user-updated", ({ user }) => {
  onlineUsers.set(user.id, user);
  renderOnlineList();
});

/* typing */
let typingTimer, typingSent = false;
socket.on("presence:typing", ({ userId, name, isTyping }) => {
  if (userId === socket.id) return;
  if (isTyping) whoTyping.set(userId, name);
  else whoTyping.delete(userId);
  updateTypingUI();
});
function updateTypingUI() {
  if (whoTyping.size === 0) return typingEl.classList.add("hidden");
  const names = Array.from(whoTyping.values()).slice(0,3);
  typingEl.textContent = `${names.join(", ")} ${names.length>1 ? "are" : "is"} typing…`;
  typingEl.classList.remove("hidden");
}

/* ---------- Input handling ---------- */
messageInput.addEventListener("input", () => {
  if (!typingSent) {
    typingSent = true;
    socket.emit("presence:typing", true);
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    typingSent = false;
    socket.emit("presence:typing", false);
  }, 900);
});

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

function sendMessage(attachment = null) {
  const text = messageInput.value.trim();
  if (!text && !attachment) return;
  socket.emit("message:send", { text, attachment }, (res) => {
    if (res?.ok) {
      messageInput.value = "";
      socket.emit("presence:typing", false);
    } else {
      renderSystem(`Message failed: ${res?.error || "unknown"}`);
    }
  });
}

/* File upload */
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    renderSystem("Unsupported file type");
    fileInput.value = "";
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    renderSystem("File too large (max 10MB)");
    fileInput.value = "";
    return;
  }
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Upload failed");
    sendMessage({ url: data.url });
  } catch (e) {
    renderSystem(`Upload error: ${e.message}`);
  } finally {
    fileInput.value = "";
  }
});

/* Avatar upload (uploads to server) */
avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    renderSystem("Avatar must be PNG/JPEG/WEBP up to 5MB");
    avatarInput.value = "";
    return;
  }
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Upload failed");
    me.avatar = data.url;
    localStorage.setItem("avatar", me.avatar);
    avatarPreview.src = makeAbsolute(me.avatar);
    socket.emit("settings:update", { avatar: me.avatar }, () => {});
  } catch (e) {
    renderSystem(`Avatar upload error: ${e.message}`);
  } finally {
    avatarInput.value = "";
  }
});

/* ---------- Settings UI ---------- */
settingsBtn.addEventListener("click", () => {
  nameField.value = me.name;
  colorA.value = me.colorA;
  colorB.value = me.colorB;
  bannerColor.value = me.banner;
  themeSelect.value = me.theme;
  toggleTimestamps.checked = localStorage.getItem("showTimestamps") === "true";
  toggleStars.checked = localStorage.getItem("starsEnabled") !== "false";
  settingsDlg.showModal();
});
closeSettings.addEventListener("click", () => settingsDlg.close());

colorA.addEventListener("input", () => previewName.style.background = `linear-gradient(135deg, ${colorA.value}, ${colorB.value})`);
colorB.addEventListener("input", () => previewName.style.background = `linear-gradient(135deg, ${colorA.value}, ${colorB.value})`);

saveSettings.addEventListener("click", (e) => {
  e.preventDefault();
  const next = {
    name: nameField.value.trim() || "Guest",
    colorA: colorA.value,
    colorB: colorB.value,
    banner: bannerColor.value,
    theme: themeSelect.value,
  };
  me = { ...me, ...next };
  localStorage.setItem("name", me.name);
  localStorage.setItem("colorA", me.colorA);
  localStorage.setItem("colorB", me.colorB);
  localStorage.setItem("banner", me.banner);
  localStorage.setItem("theme", me.theme);
  localStorage.setItem("showTimestamps", toggleTimestamps.checked ? "true" : "false");
  localStorage.setItem("starsEnabled", toggleStars.checked ? "true" : "false");

  applyNameGradient(me.colorA, me.colorB);
  applyBanner(me.banner);
  applyTheme(me.theme);

  socket.emit("settings:update", { name: me.name, color: me.colorA, banner: me.banner, avatar: me.avatar }, () => {});
  settingsDlg.close();
});

/* download & clear */
downloadChatBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(chatMessages, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `chat-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
});
clearChatBtn.addEventListener("click", () => { feed.innerHTML = ""; chatMessages = []; renderSystem("Chat cleared"); });

/* ---------- Stars background (lightweight canvas) ---------- */
(function starEngine() {
  const canvas = document.getElementById("stars");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let w, h, stars;
  function resize() {
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    w = canvas.width = innerWidth * DPR;
    h = canvas.height = innerHeight * DPR;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    ctx.scale(DPR, DPR);
    stars = createStars(Math.round((innerWidth * innerHeight) / 40000)); // density
  }
  function createStars(n) {
    const arr = [];
    for (let i=0;i<n;i++){
      arr.push({
        x: Math.random()*innerWidth,
        y: Math.random()*innerHeight,
        r: Math.random()*1.2 + 0.2,
        a: Math.random()*0.9 + 0.1,
        dx: (Math.random()-0.5)*0.04,
        dy: (Math.random()-0.5)*0.04,
        twinkle: Math.random()*0.02 + 0.005
      });
    }
    return arr;
  }
  function draw() {
    if (localStorage.getItem("starsEnabled") === "false") { ctx.clearRect(0,0,innerWidth,innerHeight); requestAnimationFrame(draw); return; }
    ctx.clearRect(0,0,innerWidth,innerHeight);
    // subtle noise / vignette
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.fillRect(0,0,innerWidth,innerHeight);

    for (const s of stars) {
      s.a += (Math.random()-0.5)*s.twinkle;
      if (s.a < 0.1) s.a = 0.1;
      if (s.a > 1) s.a = 1;
      s.x += s.dx; s.y += s.dy;
      if (s.x < 0) s.x = innerWidth;
      if (s.x > innerWidth) s.x = 0;
      if (s.y < 0) s.y = innerHeight;
      if (s.y > innerHeight) s.y = 0;
      const g = ctx.createRadialGradient(s.x,s.y,0,s.x,s.y,6);
      g.addColorStop(0, `rgba(255,255,255,${s.a})`);
      g.addColorStop(0.4, `rgba(255,255,255,${s.a*0.28})`);
      g.addColorStop(1, `rgba(255,255,255,0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r*2, 0, Math.PI*2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  addEventListener("resize", resize);
  resize();
  draw();
})();

/* ---------- Initial small bootstrap ---------- */
(function bootstrap() {
  // set toggles to defaults
  if (localStorage.getItem("showTimestamps") === null) localStorage.setItem("showTimestamps", "false");
  if (localStorage.getItem("autoScroll") === null) localStorage.setItem("autoScroll", "true");
  if (localStorage.getItem("starsEnabled") === null) localStorage.setItem("starsEnabled", "true");

  // initial avatar preview fallback
  avatarPreview.src = me.avatar ? makeAbsolute(me.avatar) : avatarFallback(me.name, 96);
  avatarPreview.onerror = () => { avatarPreview.src = avatarFallback(me.name, 96); };

  // quick keyboard focus
  messageInput.focus();
})();
