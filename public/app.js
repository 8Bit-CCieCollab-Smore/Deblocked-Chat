const API_BASE = "https://YOUR-REPL-URL.repl.co/api/messages";
const WS_URL = "wss://YOUR-REPL-URL.repl.co";

let currentUser = null;
let currentRoom = "global";
let ws;

const welcomeScreen = document.getElementById("welcome-screen");
const chatLayout = document.getElementById("chat-layout");
const usernameInput = document.getElementById("usernameInput");
const createAccountBtn = document.getElementById("createAccountBtn");
const currentUserSpan = document.getElementById("currentUser");
const conversationsDiv = document.getElementById("conversations");
const chatHeader = document.getElementById("chatHeader");
const chatBox = document.getElementById("chat");
const messageInput = document.getElementById("message");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const modal = document.getElementById("modal");
const startChatBtn = document.getElementById("startChatBtn");
const closeModalBtn = document.getElementById("closeModalBtn");
const newChatUser = document.getElementById("newChatUser");

// === Account creation ===
createAccountBtn.addEventListener("click", () => {
  const user = usernameInput.value.trim();
  if (!user) return;
  currentUser = user;
  localStorage.setItem("username", user);

  welcomeScreen.classList.add("hidden");
  chatLayout.classList.remove("hidden");
  currentUserSpan.textContent = user;

  connectWebSocket();
  loadMessages();
});

// === Load saved username ===
window.onload = () => {
  const saved = localStorage.getItem("username");
  if (saved) {
    currentUser = saved;
    welcomeScreen.classList.add("hidden");
    chatLayout.classList.remove("hidden");
    currentUserSpan.textContent = saved;

    connectWebSocket();
    loadMessages();
  }
};

// === Send messages ===
sendBtn.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !sendBtn.disabled) sendMessage();
});

messageInput.addEventListener("input", () => {
  sendBtn.disabled = !messageInput.value.trim();
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  await fetch(`${API_BASE}/${currentRoom}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: currentUser, text, color: assignedColor }),
  });

  messageInput.value = "";
  sendBtn.disabled = true;
}

// === Load messages ===
async function loadMessages() {
  const res = await fetch(`${API_BASE}/${currentRoom}`);
  const msgs = await res.json();
  chatBox.innerHTML = "";
  msgs.forEach((m) => addMessage(m.user, m.text, m.color));
}

function addMessage(user, text, color = "#fff") {
  const div = document.createElement("div");
  div.classList.add("msg");
  div.innerHTML = `<span style="color:${color}; font-weight:bold">${user}</span>: ${text}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// === Conversations ===
function addConversation(roomId, label) {
  const div = document.createElement("div");
  div.textContent = label;
  div.classList.add("conversation");
  div.addEventListener("click", () => switchRoom(roomId, label));
  conversationsDiv.appendChild(div);
}

function switchRoom(roomId, label) {
  currentRoom = roomId;
  chatHeader.textContent = label;
  loadMessages();
}

// Default Global Chat
addConversation("global", "Global Chat");

// === Modal for new chat ===
newChatBtn.addEventListener("click", () => modal.classList.remove("hidden"));
closeModalBtn.addEventListener("click", () => modal.classList.add("hidden"));

startChatBtn.addEventListener("click", () => {
  const other = newChatUser.value.trim();
  if (!other) return;
  const roomId = [currentUser, other].sort().join("_");
  addConversation(roomId, `Chat with ${other}`);
  modal.classList.add("hidden");
  newChatUser.value = "";
});

// === WebSocket ===
function connectWebSocket() {
  ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.roomId !== currentRoom) return;

    if (msg.type === "message") {
      addMessage(msg.payload.user, msg.payload.text, msg.payload.color);
    }
  };
}

// === Assign random color ===
const colors = [
  "#ff5555","#55ff55","#5555ff","#ffff55","#ff55ff","#55ffff",
  "#ffaa00","#00ffaa","#aa00ff","#ff0077","#00aaff","#aaff00",
  "#ffaa55","#55ffaa","#aa55ff","#77ff00","#0077ff","#ff7700",
  "#ffcc00","#00ffcc","#cc00ff","#ff3399","#33ccff","#99ff33",
  "#66ff99","#9966ff","#ff6666","#66ff66","#6666ff","#ff99cc",
  "#99ccff","#ccff99"
];
const assignedColor = colors[Math.floor(Math.random() * colors.length)];
