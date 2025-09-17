const API_URL = "https://voluminous-nicolina-deblocked-a71dba13.koyeb.app";

let username = localStorage.getItem("username") || null;
let currentRoom = "global";
let conversations = JSON.parse(localStorage.getItem("conversations") || "{}");

window.onload = () => {
  document.getElementById("createAccountBtn").onclick = createAccount;
  document.getElementById("sendBtn").onclick = sendMessage;
  document.getElementById("newChatBtn").onclick = () => {
    document.getElementById("modal").classList.remove("hidden");
  };
  document.getElementById("closeModalBtn").onclick = () =>
    document.getElementById("modal").classList.add("hidden");
  document.getElementById("startChatBtn").onclick = startChat;
  document.getElementById("closeErrorBtn").onclick = () =>
    document.getElementById("errorPopup").classList.add("hidden");
  document.getElementById("signOutBtn").onclick = signOut;

  // Restore session
  if (username) {
    document.getElementById("welcome-screen").classList.add("hidden");
    document.getElementById("chat-layout").classList.remove("hidden");
    document.getElementById("currentUser").innerText = username;
    document.getElementById("currentUserPfp").innerText = username[0].toUpperCase();
  }

  // Profile upload
  document.getElementById("pfpUpload").addEventListener("change", function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      const pfp = document.getElementById("currentUserPfp");
      pfp.style.background = `url(${ev.target.result}) center/cover no-repeat`;
      pfp.innerText = "";
      localStorage.setItem("pfp", ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  // Restore pfp if saved
  const savedPfp = localStorage.getItem("pfp");
  if (savedPfp) {
    const pfp = document.getElementById("currentUserPfp");
    pfp.style.background = `url(${savedPfp}) center/cover no-repeat`;
    pfp.innerText = "";
  }

  loadConversations();
  loadMessages();
};

function createAccount() {
  const input = document.getElementById("usernameInput");
  if (!input.value.trim()) return;
  username = input.value.trim();
  localStorage.setItem("username", username);
  document.getElementById("welcome-screen").classList.add("hidden");
  document.getElementById("chat-layout").classList.remove("hidden");
  document.getElementById("currentUser").innerText = username;
  document.getElementById("currentUserPfp").innerText = username[0].toUpperCase();
}

function signOut() {
  localStorage.clear();
  username = null;
  conversations = {};
  document.getElementById("chat-layout").classList.add("hidden");
  document.getElementById("welcome-screen").classList.remove("hidden");
}

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
    div.className = "msg " + (m.user === username ? "self" : "other");

    const pfp = document.createElement("div");
    pfp.className = "pfp";
    pfp.innerText = m.user[0].toUpperCase();

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "meta" + (m.user === username ? " self-user" : "");
    const time = new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.innerHTML = `<span><b>${m.user}</b></span><span>${time}</span>`;

    const text = document.createElement("div");
    text.innerText = m.text;

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
  chat.scrollTop = chat.scrollHeight;
}

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
  const chatArea = document.getElementById("chat");

  if (room === "global") {
    document.getElementById("chatHeader").innerText = "Global Chat";
    chatArea.className = "";
  } else {
    document.getElementById("chatHeader").innerText = `Chat with ${conversations[room].name}`;
    chatArea.className = "dm-chat";
  }

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
