// 🔥 IMPORTANT: replace with your actual backend URL (Koyeb, Render, etc.)
const API_URL = "https://voluminous-nicolina-deblocked-a71dba13.koyeb.app";

let username = null;
let currentRoom = "global";
let conversations = JSON.parse(localStorage.getItem("conversations") || "{}");

window.onload = () => {
  document.getElementById("createAccountBtn").onclick = createAccount;
  document.getElementById("sendBtn").onclick = sendMessage;
  document.getElementById("newChatBtn").onclick = () => {
    document.getElementById("modal").classList.remove("hidden");
  };
  document.getElementById("closeModalBtn").onclick = () => {
    document.getElementById("modal").classList.add("hidden");
  };
  document.getElementById("startChatBtn").onclick = startChat;
  document.getElementById("closeErrorBtn").onclick = () =>
    document.getElementById("errorPopup").classList.add("hidden");

  loadConversations();
  loadMessages();
};

// Create Account
function createAccount() {
  const input = document.getElementById("usernameInput");
  if (!input.value.trim()) return;
  username = input.value.trim();
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("chat-layout").classList.remove("hidden");
  document.getElementById("currentUser").innerText = username;
  document.getElementById("currentUserPfp").innerText = username[0].toUpperCase();
}

// Load messages
async function loadMessages() {
  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`);
    if (!res.ok) throw new Error("Failed to load messages");
    const data = await res.json();
    renderMessages(data);
  } catch (e) {
    console.error(e);
  }
}

function renderMessages(msgs) {
  const chat = document.getElementById("chat");
  chat.innerHTML = "";
  msgs.forEach(m => {
    const div = document.createElement("div");
    div.className = "msg";
    div.innerHTML = `<span>${m.user}:</span> ${m.text}`;
    chat.appendChild(div);
  });
}

// Send message
async function sendMessage() {
  const input = document.getElementById("message");
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: username, text })
    });

    if (res.ok) {
      input.value = "";
      loadMessages();
      updateConversationPreview(currentRoom, text);
    } else {
      console.error("Failed to send message", res.status);
    }
  } catch (e) {
    console.error("Error sending message", e);
  }
}

// DM start
async function startChat() {
  const user = document.getElementById("newChatUser").value.trim();
  if (!user) return;
  if (user === username) {
    showError("You can’t DM yourself!");
    return;
  }

  const res = await fetch(`${API_URL}/api/checkUser/${user}`);
  if (res.status !== 200) {
    showError("User does not exist");
    return;
  }

  currentRoom = `dm-${[username, user].sort().join("-")}`;
  conversations[currentRoom] = { name: user, preview: "" };
  saveConversations();
  loadConversations();
  switchRoom(currentRoom);
  document.getElementById("modal").classList.add("hidden");
}

// Sidebar update
function loadConversations() {
  const list = document.getElementById("conversations");
  list.innerHTML = "";

  // Global Chat
  const global = document.createElement("div");
  global.className = "conversation";
  global.innerHTML = `<div class="pfp">🌍</div><div><b>Global Chat</b><div class="preview">${conversations["global"]?.preview || ""}</div></div>`;
  global.onclick = () => switchRoom("global");
  list.appendChild(global);

  // DMs
  Object.keys(conversations).forEach(room => {
    if (room === "global") return;
    const conv = conversations[room];
    const div = document.createElement("div");
    div.className = "conversation";
    div.innerHTML = `<div class="pfp">${conv.name[0].toUpperCase()}</div><div><b>${conv.name}</b><div class="preview">${conv.preview || ""}</div></div>`;
    div.onclick = () => switchRoom(room);
    list.appendChild(div);
  });
}

function switchRoom(room) {
  currentRoom = room;
  document.getElementById("chatHeader").innerText =
    room === "global" ? "Global Chat" : `Chat with ${conversations[room].name}`;
  loadMessages();
}

function updateConversationPreview(room, text) {
  if (!conversations[room]) {
    conversations[room] = { name: room, preview: text };
  } else {
    conversations[room].preview = text;
  }
  saveConversations();
  loadConversations();
}

function saveConversations() {
  localStorage.setItem("conversations", JSON.stringify(conversations));
}

function showError(msg) {
  document.getElementById("errorMsg").innerText = msg;
  document.getElementById("errorPopup").classList.remove("hidden");
}
