// app.js

const API_URL = "https://deblocked-chat-production.up.railway.app";

let username = null;
let avatar = null;
let currentRoom = "global";
let rooms = {}; // stores room data { roomId: { type, participants, messages } }
let socket = null;

// Elements
const welcomeScreen = document.getElementById("welcome-screen");
const chatLayout = document.getElementById("chat-layout");
const createAccountBtn = document.getElementById("createAccountBtn");
const usernameInput = document.getElementById("usernameInput");
const chatHeader = document.getElementById("chatHeader");
const conversationsDiv = document.getElementById("conversations");
const chat = document.getElementById("chat");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const modal = document.getElementById("modal");
const newChatUserInput = document.getElementById("newChatUser");
const startChatBtn = document.getElementById("startChatBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const errorPopup = document.getElementById("errorPopup");
const errorMsg = document.getElementById("errorMsg");
const closeErrorBtn = document.getElementById("closeErrorBtn");
const currentUserEl = document.getElementById("currentUser");
const currentUserPfp = document.getElementById("currentUserPfp");
const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const logoutBtn = document.getElementById("logoutBtn");
const pfpUpload = document.getElementById("pfpUpload");

// Show error popup
function showError(msg) {
  errorMsg.innerText = msg;
  errorPopup.classList.remove("hidden");
}
closeErrorBtn.onclick = () => errorPopup.classList.add("hidden");

// Create account
createAccountBtn.onclick = () => {
  const name = usernameInput.value.trim();
  if (!name) return showError("Username required!");
  username = name;
  localStorage.setItem("username", username);
  avatar = localStorage.getItem("avatar") || null;
  currentUserEl.innerText = username;
  renderCurrentUserPfp();
  welcomeScreen.classList.add("hidden");
  chatLayout.classList.remove("hidden");
  initSocket();
  loadMessages();
};

// Render current user's PFP
function renderCurrentUserPfp() {
  if (avatar) {
    currentUserPfp.innerHTML = `<img src="${avatar}" alt="pfp"/>`;
  } else {
    currentUserPfp.innerText = username ? username[0].toUpperCase() : "?";
  }
}

// Settings overlay
settingsBtn.onclick = () => {
  settingsOverlay.classList.remove("hidden");
};
logoutBtn.onclick = () => {
  localStorage.clear();
  location.reload();
};
pfpUpload.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    avatar = reader.result;
    localStorage.setItem("avatar", avatar);
    renderCurrentUserPfp();
    // Notify server about avatar change
    socket.emit("updateAvatar", { user: username, avatar });
  };
  reader.readAsDataURL(file);
};

// Socket setup
function initSocket() {
  socket = io(API_URL);

  socket.emit("join", { user: username });

  socket.on("message", (msg) => {
    if (!rooms[msg.room]) {
      rooms[msg.room] = { type: msg.room === "global" ? "global" : "dm", participants: msg.participants || [], messages: [] };
    }
    rooms[msg.room].messages.push(msg);
    if (msg.room === currentRoom) renderMessages(rooms[msg.room].messages);
    updateConversationPreview(msg.room, msg.text || "[File]", msg);
  });

  socket.on("updateAvatar", ({ user, avatar: newAvatar }) => {
    // Update avatar in sidebar + messages
    for (let roomId in rooms) {
      if (rooms[roomId].participants && rooms[roomId].participants.includes(user)) {
        const el = document.querySelector(`[data-room="${roomId}"] .pfp`);
        if (el) {
          el.innerHTML = newAvatar
            ? `<img src="${newAvatar}" alt="pfp">`
            : user[0].toUpperCase();
        }
      }
    }
  });
}

// Send message
async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  const payload = {
    user: username,
    text,
    avatar,
    timestamp: Date.now(),
    room: currentRoom,
  };
  socket.emit("message", payload);
  messageInput.value = "";
}

// Render messages
function renderMessages(msgs) {
  if (!chat) return;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  chat.innerHTML = "";
  msgs.forEach((m) => {
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
    const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    meta.innerHTML = `<span><b>${m.user}</b></span><span>${time}</span>`;

    const text = document.createElement("div");
    text.innerText = m.text || "";

    bubble.appendChild(meta);
    bubble.appendChild(text);

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

// Get display name for sidebar
function getChatDisplayName(roomId) {
  const room = rooms[roomId];
  if (!room) return roomId;
  if (room.type === "dm") {
    return room.participants.find((u) => u !== username) || "Unknown";
  }
  return "Global Chat";
}

// Update sidebar preview
function updateConversationPreview(roomId, lastMsg, msg) {
  let entry = document.querySelector(`[data-room="${roomId}"]`);
  if (!entry) {
    entry = document.createElement("div");
    entry.className = "conversation";
    entry.dataset.room = roomId;

    const pfp = document.createElement("div");
    pfp.className = "pfp";

    const otherUser = getChatDisplayName(roomId);
    const otherAvatar = msg && msg.user !== username ? msg.avatar : null;

    if (otherAvatar) {
      pfp.innerHTML = `<img src="${otherAvatar}" alt="pfp"/>`;
    } else {
      pfp.innerText = otherUser[0].toUpperCase();
    }

    const textDiv = document.createElement("div");
    textDiv.className = "text";
    textDiv.innerHTML = `<b>${otherUser}</b><div class="preview">${lastMsg}</div>`;

    entry.appendChild(pfp);
    entry.appendChild(textDiv);

    entry.onclick = () => {
      currentRoom = roomId;
      chatHeader.innerText = getChatDisplayName(roomId);
      loadMessages();
    };

    conversationsDiv.appendChild(entry);
  } else {
    entry.querySelector(".preview").innerText = lastMsg;
    // update avatar live if provided
    if (msg && msg.avatar) {
      const pfp = entry.querySelector(".pfp");
      pfp.innerHTML = `<img src="${msg.avatar}" alt="pfp"/>`;
    }
  }
}

// Load messages for room
function loadMessages() {
  const room = rooms[currentRoom];
  if (!room) return;
  renderMessages(room.messages);
}

// New chat modal
newChatBtn.onclick = () => {
  modal.classList.remove("hidden");
};
closeModalBtn.onclick = () => {
  modal.classList.add("hidden");
};
startChatBtn.onclick = () => {
  const otherUser = newChatUserInput.value.trim();
  if (!otherUser || otherUser === username) return showError("Invalid username");
  const roomId = [username, otherUser].sort().join("_");
  if (!rooms[roomId]) {
    rooms[roomId] = { type: "dm", participants: [username, otherUser], messages: [] };
  }
  currentRoom = roomId;
  chatHeader.innerText = getChatDisplayName(roomId);
  updateConversationPreview(roomId, "New chat started", { user: otherUser });
  modal.classList.add("hidden");
  loadMessages();
};

// Event listeners
sendBtn.onclick = sendMessage;
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Auto login if stored
window.onload = () => {
  const storedUser = localStorage.getItem("username");
  const storedAvatar = localStorage.getItem("avatar");
  if (storedUser) {
    username = storedUser;
    avatar = storedAvatar;
    currentUserEl.innerText = username;
    renderCurrentUserPfp();
    welcomeScreen.classList.add("hidden");
    chatLayout.classList.remove("hidden");
    initSocket();
  }
};
