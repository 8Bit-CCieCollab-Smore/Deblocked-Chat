// public/app.js
// Frontend for Deblocked Chat V3 — fast, minimal, everything localStorage-configurable.

const socket = io({ transports: ["websocket"] });

const qs = (s) => document.querySelector(s);
const feed = qs("#feed");
const typingEl = qs("#typing");
const onlineEl = qs("#onlineCount");
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

const avatarInput = qs("#avatarInput");
const avatarPreview = qs("#avatarPreview");

// ----- State ---------------------------------------------------------------
let me = {
  name: localStorage.getItem("name") || "Guest",
  colorA: localStorage.getItem("colorA") || "#8a8a8f",
  colorB: localStorage.getItem("colorB") || "#bbbbc2",
  banner: localStorage.getItem("banner") || "#2b2b2f",
  theme: localStorage.getItem("theme") || "gray",
  avatar: localStorage.getItem("avatar") || "",
};

// Apply persisted theme immediately to avoid FOUC
applyTheme(me.theme);
applyNameGradient(me.colorA, me.colorB);
applyBanner(me.banner);
if (me.avatar) avatarPreview.src = me.avatar;

// ----- Helpers -------------------------------------------------------------
function applyNameGradient(a, b) {
  document.documentElement.style.setProperty("--name-a", a);
  document.documentElement.style.setProperty("--name-b", b);
}
function applyBanner(hex) { document.documentElement.style.setProperty("--banner", hex); }
function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-violet", "theme-ocean", "theme-emerald", "theme-sunset", "theme-void");
  if (theme === "violet") root.classList.add("theme-violet");
  else if (theme === "ocean") root.classList.add("theme-ocean");
  else if (theme === "emerald") root.classList.add("theme-emerald");
  else if (theme === "sunset") root.classList.add("theme-sunset");
  else if (theme === "void") root.classList.add("theme-void");
  // gray = base (no class)
}
function timeShort(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function scrollToBottom() {
  // Only autoscroll if near bottom to not disturb reading older messages
  const nearBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 100;
  if (nearBottom) feed.scrollTop = feed.scrollHeight;
}

// ----- Rendering -----------------------------------------------------------
function renderSystem(text, ts = Date.now()) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = `${text} • ${timeShort(ts)}`;
  feed.appendChild(div);
  scrollToBottom();
}

function renderMessage(msg) {
  if (msg.system) return renderSystem(msg.text, msg.createdAt);

  const mine = msg.user && msg.user.id === socket.id;

  const wrap = document.createElement("div");
  wrap.className = `msg ${mine ? "me" : ""}`;

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.src = msg.user?.avatar || "";
  avatar.alt = msg.user?.name || "user";
  wrap.appendChild(avatar);

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  const meta = document.createElement("div");
  meta.className = "meta";

  const tag = document.createElement("span");
  tag.className = "name-tag";
  tag.style.background = `linear-gradient(135deg, ${msg.user.color}, var(--name-b))`; // color is left stop
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
  meta.appendChild(time);

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
    at.appendChild(img);
    bubble.appendChild(at);
  }

  wrap.appendChild(bubble);
  feed.appendChild(wrap);
  scrollToBottom();
}

// ----- Socket events -------------------------------------------------------
socket.on("connect", () => {
  // initial join
  socket.emit(
    "join",
    {
      name: me.name,
      color: me.colorA, // left gradient stop personalized to user
      banner: me.banner,
      avatar: me.avatar,
    },
    (res) => {
      if (!res?.ok) return;
      onlineEl.textContent = `${res.online?.length || 1} online`;
      renderSystem("Connected");
    }
  );
});

socket.on("message:new", (msg) => renderMessage(msg));

socket.on("presence:user-joined", ({ user }) => {
  // Update count (server also sends "message:new" system)
  onlineEl.textContent = `${Math.max(1, parseInt(onlineEl.textContent) || 1) + 1} online`;
});

socket.on("presence:user-left", ({ userId }) => {
  onlineEl.textContent = `${Math.max(0, (parseInt(onlineEl.textContent) || 1) - 1)} online`;
});

let typingTimer;
const whoTyping = new Set();
socket.on("presence:typing", ({ userId, name, isTyping }) => {
  if (userId === socket.id) return;
  if (isTyping) whoTyping.add(name);
  else whoTyping.delete(name);

  if (whoTyping.size > 0) {
    typingEl.textContent = `${Array.from(whoTyping).slice(0,3).join(", ")} ${whoTyping.size>1?"are":"is"} typing…`;
    typingEl.classList.remove("hidden");
  } else typingEl.classList.add("hidden");
});

socket.on("presence:user-updated", ({ user }) => {
  // If it's me, nothing to do; others will take effect on their next messages
});

// ----- Input logic ---------------------------------------------------------
let typingSent = false;
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

sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function sendMessage(attachment = null) {
  const text = messageInput.value.trim();
  if (!text && !attachment) return;

  socket.emit("message:send", { text, attachment }, (res) => {
    if (res?.ok) {
      messageInput.value = "";
      socket.emit("presence:typing", false);
    }
  });
}

// ----- File uploads --------------------------------------------------------
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  // Client-side validation
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

// ----- Settings ------------------------------------------------------------
settingsBtn.addEventListener("click", () => {
  // preload fields
  nameField.value = me.name;
  colorA.value = me.colorA;
  colorB.value = me.colorB;
  bannerColor.value = me.banner;
  themeSelect.value = me.theme;
  settingsDlg.showModal();
});

saveSettings.addEventListener("click", (e) => {
  e.preventDefault();

  const next = {
    name: nameField.value.trim() || "Guest",
    colorA: colorA.value,
    colorB: colorB.value,
    banner: bannerColor.value,
    theme: themeSelect.value,
  };

  // Apply locally
  me = { ...me, ...next };
  localStorage.setItem("name", me.name);
  localStorage.setItem("colorA", me.colorA);
  localStorage.setItem("colorB", me.colorB);
  localStorage.setItem("banner", me.banner);
  localStorage.setItem("theme", me.theme);

  applyNameGradient(me.colorA, me.colorB);
  applyBanner(me.banner);
  applyTheme(me.theme);

  // Broadcast core identity bits
  socket.emit(
    "settings:update",
    { name: me.name, color: me.colorA, banner: me.banner, avatar: me.avatar },
    () => {}
  );

  settingsDlg.close();
});

// Avatar upload (local preview + store dataURL; optional: send via /upload as well)
avatarInput.addEventListener("change", async () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    renderSystem("Avatar must be PNG/JPEG/WEBP up to 5MB");
    avatarInput.value = "";
    return;
  }

  // Upload to server to avoid massive data URLs in localStorage
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch("/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Upload failed");
    me.avatar = data.url;
    localStorage.setItem("avatar", me.avatar);
    avatarPreview.src = me.avatar;

    socket.emit("settings:update", { avatar: me.avatar }, () => {});
  } catch (e) {
    renderSystem(`Avatar upload error: ${e.message}`);
  } finally {
    avatarInput.value = "";
  }
});

// Initialize avatar preview (placeholder if none)
if (!avatarPreview.src) {
  // simple placeholder gradient
  const svg =
    `data:image/svg+xml;utf8,` +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#444"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`
    );
  avatarPreview.src = svg;
}
