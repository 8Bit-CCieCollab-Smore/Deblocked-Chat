const API_URL = "https://deblocked-chat-production.up.railway.app";

let username = localStorage.getItem("username") || null;
let currentRoom = localStorage.getItem("currentRoom") || "global";
let conversations = JSON.parse(localStorage.getItem("conversations") || "{}");
let avatar = localStorage.getItem("avatar") || null;

// Helper
function $(id) { return document.getElementById(id); }

// Elements
const welcomeScreen = $("welcome-screen");
const chatLayout = $("chat-layout");
const usernameInput = $("usernameInput");
const createAccountBtn = $("createAccountBtn");
const currentUser = $("currentUser");
const currentUserPfp = $("currentUserPfp");
const sendBtn = $("sendBtn");
const messageInput = $("message");
const chat = $("chat");
const newChatBtn = $("newChatBtn");
const modal = $("modal");
const newChatUser = $("newChatUser");
const startChatBtn = $("startChatBtn");
const closeModalBtn = $("closeModalBtn");
const errorPopup = $("errorPopup");
const errorMsg = $("errorMsg");
const closeErrorBtn = $("closeErrorBtn");
const conversationsList = $("conversations");
const chatHeader = $("chatHeader");
const fileInput = $("fileInput");
const attachBtn = $("attachBtn");
const settingsBtn = $("settingsBtn");
const settingsOverlay = $("settingsOverlay");
const closeSettingsBtn = $("closeSettingsBtn");
const logoutBtn = $("logoutBtn");
const setPfpBtn = $("setPfpBtn");
const pfpUpload = $("pfpUpload");

// --- INIT ---
window.onload = async () => {
  try {
    if (createAccountBtn) createAccountBtn.onclick = createAccount;
    if (sendBtn) sendBtn.onclick = sendMessage;
    if (attachBtn && fileInput) attachBtn.onclick = () => fileInput.click();

    if (messageInput) {
      messageInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    if (newChatBtn) newChatBtn.onclick = () => modal?.classList.remove("hidden");
    if (closeModalBtn) closeModalBtn.onclick = () => modal?.classList.add("hidden");
    if (startChatBtn) startChatBtn.onclick = startChat;
    if (closeErrorBtn) closeErrorBtn.onclick = () => errorPopup?.classList.add("hidden");

    // ⚙️ Settings
    if (settingsBtn) settingsBtn.onclick = () => settingsOverlay?.classList.remove("hidden");
    if (closeSettingsBtn) closeSettingsBtn.onclick = () => settingsOverlay?.classList.add("hidden");
    if (logoutBtn) logoutBtn.onclick = signOut;
    if (setPfpBtn) setPfpBtn.onclick = () => pfpUpload?.click();

  // Profile picture upload
if (pfpUpload) {
  pfpUpload.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      avatar = ev.target.result;
      localStorage.setItem("avatar", avatar);

      // Update the small profile picture
      if (currentUserPfp)
        currentUserPfp.innerHTML = `<img src="${avatar}" alt="pfp">`;

      // 🖼️ Update the blurred banner behind footer
      const userFooter = document.getElementById("userFooter");
      if (userFooter) {
        userFooter.style.setProperty("--user-bg", `url("${avatar}")`);
        // fallback for browsers that ignore CSS vars in pseudo-elements
        userFooter.style.backgroundImage = `url("${avatar}")`;
      }
    };
    reader.readAsDataURL(file);
  });
}


    // Restore session
    if (username) {
      welcomeScreen?.classList.add("hidden");
      chatLayout?.classList.remove("hidden");
      if (currentUser) currentUser.innerText = username;
      if (currentUserPfp) {
        if (avatar) currentUserPfp.innerHTML = `<img src="${avatar}" alt="pfp">`;
        else currentUserPfp.innerText = username[0].toUpperCase();
      }
      await loadUserRooms();
      startPresence();
    }

    loadConversations();
    loadMessages();

    // Polling
    setInterval(loadMessages, 2000);
    setInterval(updateOnlineCount, 10000);
    setInterval(loadUserRooms, 5000);
  } catch (err) {
    console.error("Startup failed:", err);
  }
};

// --- ACCOUNT ---
function createAccount() {
  if (!usernameInput) return;
  const input = usernameInput.value.trim();
  if (!input) return;
  username = input;
  localStorage.setItem("username", username);
  location.reload();
}

function signOut() {
  if (username) {
    try {
      const data = new Blob([JSON.stringify({ user: username })], { type: "application/json" });
      navigator.sendBeacon?.(`${API_URL}/api/online/leave`, data);
    } catch {}
  }
  localStorage.clear();
  username = null;
  conversations = {};
  avatar = null;
  chatLayout?.classList.add("hidden");
  welcomeScreen?.classList.remove("hidden");
}

// --- MESSAGES ---
async function getCurrentMessages() {
  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function loadMessages() {
  if (!username) return;
  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`);
    if (!res?.ok) throw new Error("Failed to load messages");
    const data = await res.json();
    renderMessages(data);
  } catch (e) {
    console.error(e);
  }
}

function renderMessages(msgs) {
  if (!chat) return;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  chat.innerHTML = "";

// 📨 If no messages exist, show friendly placeholder
if (!msgs || msgs.length === 0) {
  const emptyNotice = document.createElement("div");
  emptyNotice.innerText = "No messages sent yet";
  emptyNotice.style.textAlign = "center";
  emptyNotice.style.opacity = "0.7";
  emptyNotice.style.marginTop = "20px";
  emptyNotice.style.fontSize = "14px";
  chat.appendChild(emptyNotice);
  return;
}

msgs.forEach(m => {

    const div = document.createElement("div");
    div.className = "msg " + (m.user === username ? "self" : "other");

    const pfp = document.createElement("div");
    pfp.className = "pfp";
    if (m.avatar) pfp.innerHTML = `<img src="${m.avatar}" alt="pfp">`;
    else pfp.innerText = m.user[0].toUpperCase();

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "meta" + (m.user === username ? " self-user" : "");
    const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    meta.innerHTML = `<span><b>${m.user}</b></span><span>${time}</span>`;

    const text = document.createElement("div");
    text.innerText = m.text || "";

    bubble.appendChild(meta);
    if (m.text) bubble.appendChild(text);

    if (m.file) {
      const fileEl = document.createElement("div");
      fileEl.style.marginTop = "6px";
      if (m.file.startsWith("data:image")) {
        const img = document.createElement("img");
        img.src = m.file;
        img.style.maxWidth = "200px";
        img.style.borderRadius = "8px";
        fileEl.appendChild(img);
      } else {
        const a = document.createElement("a");
        a.href = m.file;
        a.download = m.fileName || "file";
        a.innerText = m.fileName || "Download File";
        fileEl.appendChild(a);
      }
      bubble.appendChild(fileEl);
    }

    if (m.sending) {
      const sendingEl = document.createElement("div");
      sendingEl.style.fontSize = "11px";
      sendingEl.style.opacity = "0.8";
      sendingEl.innerText = "sending...";
      bubble.appendChild(sendingEl);
    }

    if (m.user === username) {
      div.appendChild(bubble);
      div.appendChild(pfp);
    } else {
      div.appendChild(pfp);
      div.appendChild(bubble);
    }

    chat.appendChild(div);
  });

  if (nearBottom) chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
  if (!messageInput) return;
  const text = messageInput.value.trim();
  const file = fileInput?.files[0];
  if (!text && !file) return;

  // instant placeholder
  const tempMsg = { user: username, text, avatar, timestamp: Date.now(), sending: true };
  const currentMsgs = await getCurrentMessages();
  renderMessages([...currentMsgs, tempMsg]);

  let payload = { user: username, text, avatar, timestamp: Date.now() };

  if (file) {
    const reader = new FileReader();
    reader.onload = async e => {
      payload.file = e.target.result;
      payload.fileName = file.name;
      await sendPayload(payload);
      messageInput.value = "";
      if (fileInput) fileInput.value = "";
    };
    reader.readAsDataURL(file);
  } else {
    await sendPayload(payload);
    messageInput.value = "";
  }
}

async function sendPayload(payload) {
  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);
    if (res?.ok) {
      loadMessages();
      updateConversationPreview(currentRoom, payload.text || payload.fileName || "[File]");
    } else console.error("Failed to send message");
  } catch (e) {
    console.error("Error sending message", e);
  }
}

// --- DM / Conversations ---
async function startChat() {
  if (!newChatUser) return;
  const user = newChatUser.value.trim();
  if (!user) return;
  if (user === username) return showError("You can’t DM yourself!");

  try {
    const res = await fetch(`${API_URL}/api/checkUser/${user}`).catch(() => null);
    if (!res?.ok) return showError("User does not exist");

    const create = await fetch(`${API_URL}/api/dm/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ users: [username, user] })
    });
    const { roomId } = await create.json();

    // find their avatar from messages if any
    let avatarUrl = null;
    try {
      const msgRes = await fetch(`${API_URL}/api/messages/${roomId}`);
      if (msgRes.ok) {
        const msgs = await msgRes.json();
        const theirs = msgs.find(m => m.user === user && m.avatar);
        if (theirs) avatarUrl = theirs.avatar;
      }
    } catch {}

    conversations[roomId] = { name: user, preview: "", avatar: avatarUrl };
    saveConversations();
    loadConversations();
    switchRoom(roomId);
    modal?.classList.add("hidden");
  } catch {
    showError("Server error");
  }
}

async function loadUserRooms() {
  if (!username) return;
  try {
    const res = await fetch(`${API_URL}/api/userRooms/${username}`);
    if (!res.ok) return;
    const { rooms } = await res.json();

    for (const roomId of rooms) {
      let otherName = "Unknown";
      if (roomId.startsWith("dm-")) {
        const parts = roomId.split("-").slice(1);
        otherName = parts.find(n => n !== username) || "Unknown";
      }

      let avatarUrl = null;
      try {
        const msgRes = await fetch(`${API_URL}/api/messages/${roomId}`);
        if (msgRes.ok) {
          const msgs = await msgRes.json();
          const lastMsg = [...msgs].reverse().find(m => m.user === otherName && m.avatar);
          if (lastMsg) avatarUrl = lastMsg.avatar;
        }
      } catch {}

      if (!conversations[roomId]) {
        conversations[roomId] = { name: otherName, preview: "", avatar: avatarUrl };
      } else {
        if (!conversations[roomId].avatar && avatarUrl)
          conversations[roomId].avatar = avatarUrl;
      }
    }

    saveConversations();
    loadConversations();
  } catch (e) {
    console.error("Failed to load user rooms", e);
  }
}

function loadConversations() {
  if (!conversationsList) return;
  conversationsList.innerHTML = "";

  // Global Chat
  const global = document.createElement("div");
  global.className = "conversation global";
  global.innerHTML = `
    <div class="pfp">🌍</div>
    <div>
      <b class="title">Global Chat</b>
      <div class="preview">${conversations["global"]?.preview || ""}</div>
    </div>
  `;
  global.onclick = () => switchRoom("global");
  conversationsList.appendChild(global);

  // DMs
  Object.keys(conversations).forEach(room => {
    if (room === "global") return;
    const conv = conversations[room];
    const avatarHTML = conv.avatar
      ? `<img src="${conv.avatar}" alt="pfp">`
      : `<span>${conv.name[0].toUpperCase()}</span>`;

    const div = document.createElement("div");
    div.className = "conversation";
    div.innerHTML = `
      <div class="pfp">${avatarHTML}</div>
      <div>
        <b>${conv.name}</b>
        <div class="preview">${conv.preview || ""}</div>
      </div>
      <span class="badge"></span>
    `;
    div.onclick = () => switchRoom(room);
    conversationsList.appendChild(div);
  });

  updateOnlineCount();
}

function switchRoom(room) {
  currentRoom = room;
  localStorage.setItem("currentRoom", room);
  if (chatHeader)
    chatHeader.innerText = room === "global" ? "Global Chat" : `Chat with ${conversations[room]?.name || room}`;
  loadMessages();
  if (room === "global") updateOnlineCount();
}

function updateConversationPreview(room, text) {
  if (!conversations[room]) conversations[room] = { name: room, preview: text };
  else conversations[room].preview = text;
  saveConversations();
  loadConversations();
}

function saveConversations() {
  localStorage.setItem("conversations", JSON.stringify(conversations));
}

// --- Errors ---
function showError(msg) {
  if (!errorPopup || !errorMsg) return;
  errorMsg.innerText = msg;
  errorPopup.classList.remove("hidden");
}

// --- Online presence ---
async function updateOnlineCount() {
  try {
    const res = await fetch(`${API_URL}/api/online`).catch(() => null);
    if (!res?.ok) throw new Error("Failed to fetch online count");
    const { count } = await res.json();

    const globalTab = document.querySelector("#conversations .conversation.global");
    if (globalTab) {
      const titleEl = globalTab.querySelector(".title");
      if (titleEl) titleEl.innerText = `Global Chat - ${count} Online`;
    }
  } catch (e) {
    console.error("Error updating online count", e);
  }
}

function startPresence() {
  pingOnline();
  setInterval(pingOnline, 15000);
  window.addEventListener("beforeunload", () => {
    try {
      const data = new Blob([JSON.stringify({ user: username })], { type: "application/json" });
      navigator.sendBeacon?.(`${API_URL}/api/online/leave`, data);
    } catch {}
  });
}

async function pingOnline() {
  if (!username) return;
  try {
    await fetch(`${API_URL}/api/online/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: username }),
      keepalive: true
    });
  } catch (e) {
    console.error("Presence ping failed", e);
  }
}
