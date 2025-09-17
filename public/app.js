// ====== CONFIG ======
const API_BASE = window.API_BASE || ""; // same origin by default
const WS_URL   = window.WS_URL   || ((location.protocol === "https:") ? `wss://${location.host}` : `ws://${location.host}`);

const GLOBAL_ROOM = "global";

// ====== STATE ======
let username = localStorage.getItem("username") || "";
let avatar   = localStorage.getItem("avatar")   || ""; // data URL or http url
let currentRoom = localStorage.getItem("currentRoom") || GLOBAL_ROOM;
let socket;
let rooms = new Set([GLOBAL_ROOM]); // known rooms (global + DMs)
const unread = JSON.parse(localStorage.getItem("unread") || "{}"); // {room: true}

// ====== ELEMENTS ======
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const welcomeOverlay = $("#welcomeOverlay");
const welcomeName    = $("#welcomeName");
const welcomeCreate  = $("#welcomeCreate");

const topHeader      = $("#topHeader");
const signOut        = $("#signOut");

const conversations  = $("#conversations");
const chatHeader     = $("#chatHeader .room");
const chatEl         = $("#chat");

const composerInput  = $("#message");
const sendBtn        = $("#sendBtn");

const newChatBtn     = $("#newChatBtn");
const groupBtn       = $("#groupBtn");

const startModal     = $("#startModal");
const startInput     = $("#startInput");
const startGo        = $("#startGo");
const startCancel    = $("#startCancel");

const pfpInput       = $("#pfpInput");
const profileRow     = $("#profileRow");

// ====== HELPERS ======
const fmtTime = ts => {
  const d = new Date(ts || Date.now());
  return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
};

function convIdForUser(u){
  // DM id is sorted combination "dm:userA_userB"
  const a = [username, u].sort().join("_");
  return `dm:${a}`;
}

function ensureRoomItem(id, label){
  if ($(`.conv[data-id="${id}"]`)) return;
  const item = document.createElement("div");
  item.className = "conv";
  item.dataset.id = id;
  item.innerHTML = `
    <div class="pfp small-pfp"></div>
    <div>
      <div class="title">${label}</div>
      <div class="preview small"> </div>
    </div>
    <span class="badge"></span>
  `;
  conversations.appendChild(item);

  item.addEventListener("click", () => {
    switchRoom(id);
  });
}

function setConvUnread(id, on){
  const el = $(`.conv[data-id="${id}"]`);
  if (!el) return;
  el.classList.toggle("unread", !!on);
}

function saveUnread(){
  localStorage.setItem("unread", JSON.stringify(unread));
}

function atBottom(el){
  const slack = 80;
  return (el.scrollHeight - el.scrollTop - el.clientHeight) < slack;
}

function scrollToBottom(el){
  el.scrollTop = el.scrollHeight + 1000;
}

function bubbleHTML(msg){
  // msg = {user, text, ts, color, avatar}
  const mine = msg.user === username;
  const pfp = msg.avatar || "";
  const pfpNode = pfp
    ? `<div class="pfp"><img src="${pfp}" alt=""></div>`
    : `<div class="pfp">${(msg.user||"?").slice(0,1).toUpperCase()}</div>`;

  return `
    <div class="msg ${mine ? "me": ""}">
      ${mine ? "" : pfpNode}
      <div class="bubble">
        <div class="meta"><strong style="color:${msg.color||'#9fd1ff'}">${msg.user}</strong> • ${fmtTime(msg.ts)}</div>
        <div class="text">${escapeHTML(msg.text)}</div>
      </div>
      ${mine ? pfpNode.replace('class="pfp"', 'class="pfp" style="visibility:hidden"') : ""}
    </div>
  `;
}

function escapeHTML(s){
  return (s||"").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function colorForUser(u){
  // deterministic pastel hue
  let h = 0;
  for (let i=0;i<u.length;i++) h = (h*31 + u.charCodeAt(i)) % 360;
  return `hsl(${h}, 70%, 70%)`;
}

// ====== UI SETUP ======
function hydrateSidebar(){
  conversations.innerHTML = "";
  ensureRoomItem(GLOBAL_ROOM, "Global Chat");
  setConvUnread(GLOBAL_ROOM, unread[GLOBAL_ROOM]);
  // any remembered DM rooms
  const storedRooms = JSON.parse(localStorage.getItem("rooms") || "[]");
  storedRooms.forEach(id => rooms.add(id));
  rooms.forEach(id => {
    if (id !== GLOBAL_ROOM){
      const parts = id.split(":")[1]?.split("_") || [];
      const other = parts.find(x => x !== username) || "DM";
      ensureRoomItem(id, `Chat with ${other}`);
      setConvUnread(id, unread[id]);
    }
  });
}

function setProfileRow(){
  const pfp = document.createElement("div");
  pfp.className = "pfp";
  if (avatar){
    const img = document.createElement("img");
    img.src = avatar;
    pfp.appendChild(img);
  } else {
    pfp.textContent = (username[0]||"?").toUpperCase();
  }

  const meta = document.createElement("div");
  meta.className = "user-meta";
  meta.innerHTML = `<div class="name">${username}</div><div class="status">Online</div>`;

  profileRow.innerHTML = "";
  profileRow.appendChild(pfp);
  profileRow.appendChild(meta);
}

// ====== DATA FLOW ======
async function loadMessages(room){
  try{
    const res = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(room)}`);
    const arr = await res.json();
    renderMessages(arr);
  }catch(e){
    console.error(e);
  }
}

function renderMessages(list){
  const nearBottom = atBottom(chatEl);
  chatEl.innerHTML = list.map(bubbleHTML).join("");
  if (nearBottom) scrollToBottom(chatEl);
}

async function sendMessage(){
  const text = composerInput.value.trim();
  if (!text) return;
  const payload = {
    user: username,
    text,
    color: colorForUser(username),
    avatar,
    room: currentRoom
  };
  composerInput.value = "";

  // optimistic append (and autoscroll)
  const nearBottom = atBottom(chatEl);
  chatEl.insertAdjacentHTML("beforeend", bubbleHTML({...payload, ts: Date.now()}));
  if (nearBottom) scrollToBottom(chatEl);

  try{
    await fetch(`${API_BASE}/api/messages/${encodeURIComponent(currentRoom)}`, {
      method:"POST",
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
  }catch(e){
    console.error(e);
  }
}

// ====== ROOMS ======
function switchRoom(id){
  currentRoom = id;
  localStorage.setItem("currentRoom", id);

  // clear unread
  unread[id] = false; saveUnread(); setConvUnread(id, false);
  $$(".conv").forEach(n => n.classList.toggle("active", n.dataset.id === id));
  chatHeader.textContent = (id === GLOBAL_ROOM) ? "Global Chat" : friendlyLabel(id);

  loadMessages(id);
}

function friendlyLabel(id){
  if (id === GLOBAL_ROOM) return "Global Chat";
  const parts = id.split(":")[1]?.split("_") || [];
  const other = parts.find(x => x !== username) || "Chat";
  return `Chat with ${other}`;
}

function rememberRoom(id){
  rooms.add(id);
  localStorage.setItem("rooms", JSON.stringify([...rooms]));
}

// ====== SOCKET ======
function connectSocket(){
  try{
    socket = new WebSocket(WS_URL);
  }catch(e){
    console.warn("WebSocket failed, will keep polling via /api", e);
    return;
  }
  socket.addEventListener("open", ()=> console.log("ws open"));
  socket.addEventListener("message", (ev) => {
    try{
      const msg = JSON.parse(ev.data);
      if (!msg.room) msg.room = GLOBAL_ROOM;

      // If message belongs to another room, badge + preview
      if (msg.room !== currentRoom){
        unread[msg.room] = true; saveUnread(); setConvUnread(msg.room, true);
        ensureRoomItem(msg.room, friendlyLabel(msg.room));
        $(`.conv[data-id="${msg.room}"] .preview`)?.replaceChildren(
          document.createTextNode(`${msg.user}: ${msg.text.slice(0,40)}`)
        );
        return;
      }

      // append to current room
      const nearBottom = atBottom(chatEl);
      chatEl.insertAdjacentHTML("beforeend", bubbleHTML(msg));
      if (nearBottom || msg.user === username) scrollToBottom(chatEl);
    }catch(e){}
  });
  socket.addEventListener("close", ()=> console.log("ws closed"));
}

// ====== EVENTS ======
sendBtn.addEventListener("click", sendMessage);
composerInput.addEventListener("keydown", (e)=>{ if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); sendMessage(); } });

newChatBtn?.addEventListener("click", ()=> {
  startModal.classList.add("show");
  startInput.value = "";
  startInput.focus();
});
groupBtn?.addEventListener("click", ()=> {
  startModal.classList.add("show");
  startInput.placeholder = "Enter username to DM";
  startInput.focus();
});
startCancel.addEventListener("click", ()=> startModal.classList.remove("show"));
startGo.addEventListener("click", ()=>{
  const other = startInput.value.trim();
  if (!other || other === username) return;
  const id = convIdForUser(other);
  ensureRoomItem(id, friendlyLabel(id));
  rememberRoom(id);
  startModal.classList.remove("show");
  switchRoom(id);
});

pfpInput?.addEventListener("change", (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  const rd = new FileReader();
  rd.onload = () => {
    avatar = rd.result;
    localStorage.setItem("avatar", avatar);
    setProfileRow();
  };
  rd.readAsDataURL(file);
});

signOut.addEventListener("click", ()=>{
  localStorage.removeItem("username");
  localStorage.removeItem("avatar");
  localStorage.removeItem("rooms");
  localStorage.removeItem("currentRoom");
  localStorage.removeItem("unread");
  location.reload();
});

// Welcome create (force refresh after save)
welcomeCreate?.addEventListener("click", ()=>{
  const u = (welcomeName.value||"").trim();
  if (!u) return;
  username = u;
  localStorage.setItem("username", username);
  localStorage.setItem("currentRoom", GLOBAL_ROOM);
  setTimeout(()=> location.reload(), 60); // tiny delay to flush storage
});

// ====== INIT ======
async function init(){
  if (!username){
    // show welcome
    welcomeOverlay.classList.remove("hidden");
    welcomeName.focus();
    return;
  }
  welcomeOverlay.classList.add("hidden");

  hydrateSidebar();
  setProfileRow();
  connectSocket();

  // initial load of current room
  switchRoom(currentRoom);

  // Poll fallback if no WebSocket
  setInterval(()=> loadMessages(currentRoom), 10000);
}
init();
