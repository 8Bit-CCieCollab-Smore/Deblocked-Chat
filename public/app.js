const API_URL = "https://voluminous-nicolina-deblocked-a71dba13.koyeb.app";

let username = localStorage.getItem("username") || null;
let currentRoom = "global";
let conversations = JSON.parse(localStorage.getItem("conversations") || "{}");
let avatar = localStorage.getItem("avatar") || null;

// Helper for safe DOM selection
function $(id) {
  return document.getElementById(id);
}

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
const signOutBtn = $("signOutBtn");
const pfpUpload = $("pfpUpload"); // optional

// -------- INIT --------
window.onload = () => {
  if (createAccountBtn) createAccountBtn.onclick = createAccount;
  if (sendBtn) sendBtn.onclick = sendMessage;
  if (messageInput) {
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { // Enter without Shift
      e.preventDefault(); // stop new line
      sendMessage();
    }
  });
}
  if (newChatBtn) newChatBtn.onclick = () => modal?.classList.remove("hidden");
  if (closeModalBtn) closeModalBtn.onclick = () => modal?.classList.add("hidden");
  if (startChatBtn) startChatBtn.onclick = startChat;
  if (closeErrorBtn) closeErrorBtn.onclick = () => errorPopup?.classList.add("hidden");
  if (signOutBtn) signOutBtn.onclick = signOut;

  // Restore session
  if (username) {
    welcomeScreen?.classList.add("hidden");
    chatLayout?.classList.remove("hidden");
    if (currentUser) currentUser.innerText = username;
    if (currentUserPfp) {
      if (avatar) {
        currentUserPfp.innerHTML = `<img src="${avatar}" alt="pfp">`;
      } else {
        currentUserPfp.innerText = username[0].toUpperCase();
      }
    }
  }

  // Profile upload
  if (pfpUpload) {
    pfpUpload.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        avatar = ev.target.result;
        localStorage.setItem("avatar", avatar);
        if (currentUserPfp) {
          currentUserPfp.innerHTML = `<img src="${avatar}" alt="pfp">`;
        }
      };
      reader.readAsDataURL(file);
    });
  }

  loadConversations();
  loadMessages();
};

// -------- ACCOUNT --------
function createAccount() {
  if (!usernameInput) return;
  const input = usernameInput.value.trim();
  if (!input) return;
  username = input;
  localStorage.setItem("username", username);
  // force refresh to apply state
  location.reload();
}

function signOut() {
  localStorage.clear();
  username = null;
  conversations = {};
  avatar = null;
  chatLayout?.classList.add("hidden");
  welcomeScreen?.classList.remove("hidden");
}

// -------- MESSAGES --------
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
  if (!chat) return;
  const nearBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 80;
  chat.innerHTML = "";
  msgs.forEach((m) => {
    const div = document.createElement("div");
    div.className = "msg " + (m.user === username ? "self" : "other");

    const pfp = document.createElement("div");
    pfp.className = "pfp";
    if (m.avatar) {
      pfp.innerHTML = `<img src="${m.avatar}" alt="pfp">`;
    } else {
      pfp.innerText = m.user[0].toUpperCase();
    }

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
  if (nearBottom) chat.scrollTop = chat.scrollHeight;
}

async function sendMessage() {
  if (!messageInput) return;
  const text = messageInput.value.trim();
  if (!text) return;

  const payload = {
    user: username,
    text,
    avatar,
    timestamp: Date.now(),
  };

  try {
    const res = await fetch(`${API_URL}/api/messages/${currentRoom}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      messageInput.value = "";
      loadMessages();
      updateConversationPreview(currentRoom, text);
    } else {
      console.error("Failed to send message", res.status);
    }
  } catch (e) {
    console.error("Error sending message", e);
  }
}

// -------- CONVERSATIONS --------
async function startChat() {
  if (!newChatUser) return;
  const user = newChatUser.value.trim();
  if (!user) return;
  if (user === username) {
    showError("You can’t DM yourself!");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/checkUser/${user}`);
    if (res.status !== 200) {
      showError("User does not exist");
      return;
    }
  } catch {
    showError("Server error");
    return;
  }

  currentRoom = `dm-${[username, user].sort().join("-")}`;
  conversations[currentRoom] = { name: user, preview: "" };
  saveConversations();
  loadConversations();
  switchRoom(currentRoom);
  modal?.classList.add("hidden");
}

function loadConversations() {
  if (!conversationsList) return;
  conversationsList.innerHTML = "";

  // Global Chat
  const global = document.createElement("div");
  global.className = "conversation";
  global.innerHTML = `<div class="pfp">🌍</div><div><b>Global Chat</b><div class="preview">${
    conversations["global"]?.preview || ""
  }</div></div><span class="badge"></span>`;
  global.onclick = () => switchRoom("global");
  conversationsList.appendChild(global);

  // DMs
  Object.keys(conversations).forEach((room) => {
    if (room === "global") return;
    const conv = conversations[room];
    const div = document.createElement("div");
    div.className = "conversation";
    div.innerHTML = `<div class="pfp">${conv.name[0].toUpperCase()}</div><div><b>${conv.name}</b><div class="preview">${conv.preview || ""}</div></div><span class="badge"></span>`;
    div.onclick = () => switchRoom(room);
    conversationsList.appendChild(div);
  });
}

function switchRoom(room) {
  currentRoom = room;
  localStorage.setItem("currentRoom", room);
  if (chatHeader) {
    chatHeader.innerText =
      room === "global" ? "Global Chat" : `Chat with ${conversations[room].name}`;
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

// -------- ERRORS --------
function showError(msg) {
  if (!errorPopup || !errorMsg) return;
  errorMsg.innerText = msg;
  errorPopup.classList.remove("hidden");
}
