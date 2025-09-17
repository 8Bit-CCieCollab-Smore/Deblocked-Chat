const API_URL = "https://voluminous-nicolina-deblocked-a71dba13.koyeb.app";

let username = localStorage.getItem("username") || null;
let currentRoom = "global";
let conversations = JSON.parse(localStorage.getItem("conversations") || "{}");
let avatar = localStorage.getItem("avatar") || null;
let banner = localStorage.getItem("banner") || null;
let onlineUsers = JSON.parse(localStorage.getItem("onlineUsers") || "{}");

const $ = (id) => document.getElementById(id);

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
const settingsOverlay = $("settingsOverlay");
const choosePfpBtn = $("choosePfpBtn");
const chooseBannerBtn = $("chooseBannerBtn");
const logoutBtn = $("logoutBtn");

// Profile overlay
const profileOverlay = $("profileOverlay");
const profileBanner = $("profileBanner");
const profilePfp = $("profilePfp");
const profileUsername = $("profileUsername");
const profileStatus = $("profileStatus");
const addFriendBtn = $("addFriendBtn");
const dmUserBtn = $("dmUserBtn");
const profileMsgInput = $("profileMsgInput");

let viewedUser = null;

// -------- ONLINE STATUS HELPERS --------
function markOnline(user) {
  onlineUsers[user] = Date.now();
  localStorage.setItem("onlineUsers", JSON.stringify(onlineUsers));
}

function isUserOnline(user) {
  const lastSeen = onlineUsers[user];
  if (!lastSeen) return false;
  return Date.now() - lastSeen < 120000; // 2 min threshold
}

// Heartbeat every 20s
setInterval(() => {
  if (username) {
    markOnline(username);
  }
  // prune old users after 5 min
  Object.keys(onlineUsers).forEach((u) => {
    if (Date.now() - onlineUsers[u] > 300000) {
      delete onlineUsers[u];
    }
  });
  localStorage.setItem("onlineUsers", JSON.stringify(onlineUsers));
  loadMessages();
  loadConversations();
}, 20000);

// -------- INIT --------
window.onload = () => {
  if (createAccountBtn) createAccountBtn.onclick = createAccount;
  if (sendBtn) sendBtn.onclick = sendMessage;
  if (newChatBtn) newChatBtn.onclick = () => modal?.classList.remove("hidden");
  if (closeModalBtn) closeModalBtn.onclick = () => modal?.classList.add("hidden");
  if (startChatBtn) startChatBtn.onclick = startChat;
  if (closeErrorBtn) closeErrorBtn.onclick = () => errorPopup?.classList.add("hidden");
  if (logoutBtn) logoutBtn.onclick = signOut;

  // Enter to send
  if (messageInput) {
    messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

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
    markOnline(username);
  }

  // PFP upload
  if (choosePfpBtn) {
    choosePfpBtn.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        avatar = ev.target.result;
        localStorage.setItem("avatar", avatar);
      };
      reader.readAsDataURL(file);
    });
  }

  // Banner upload
  if (chooseBannerBtn) {
    chooseBannerBtn.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        banner = ev.target.result;
        localStorage.setItem("banner", banner);
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
    pfp.onclick = () => {
      openProfile(m.user, m.avatar, m.banner);
    };

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const meta = document.createElement("div");
    meta.className = "meta" + (m.user === username ? " self-user" : "");
    const isOnline = isUserOnline(m.user);
    meta.innerHTML = `<span><b>${m.user}</b></span><span class="${
      isOnline ? "online" : "offline"
    }">${isOnline ? "Online" : "Offline"}</span>`;

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
    banner,
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
      markOnline(username);
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
  global.dataset.room = "global";
  const globalOnline = isUserOnline("global");
  global.innerHTML = `<div class="pfp">🌍</div><div><b>Global Chat</b><div class="preview">${
    conversations["global"]?.preview || ""
  }</div></div><span class="badge"></span>`;
  global.onclick = () => {
    switchRoom("global");
    setUnread("global", false);
  };
  conversationsList.appendChild(global);

  // DMs
  Object.keys(conversations).forEach((room) => {
    if (room === "global") return;
    const conv = conversations[room];
    const div = document.createElement("div");
    div.className = "conversation";
    div.dataset.room = room;
    const isOnline = isUserOnline(conv.name);
    div.innerHTML = `<div class="pfp">${conv.name[0].toUpperCase()}</div>
      <div><b>${conv.name}</b>
      <div class="preview">${conv.preview || ""}</div></div>
      <span class="badge"></span>`;
    div.onclick = () => {
      switchRoom(room);
      setUnread(room, false);
    };
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
  if (room !== currentRoom) setUnread(room, true);
}

function saveConversations() {
  localStorage.setItem("conversations", JSON.stringify(conversations));
}

function setUnread(room, on) {
  const conv = document.querySelector(`.conversation[data-room="${room}"]`);
  if (!conv) return;
  if (on) conv.classList.add("unread");
  else conv.classList.remove("unread");
}

// -------- ERRORS --------
function showError(msg) {
  if (!errorPopup || !errorMsg) return;
  errorMsg.innerText = msg;
  errorPopup.classList.remove("hidden");
}

// -------- PROFILE --------
function openProfile(user, avatarUrl, bannerUrl) {
  viewedUser = user;
  profileOverlay.classList.add("show");

  profileBanner.style.backgroundImage = bannerUrl
    ? `url(${bannerUrl})`
    : "linear-gradient(135deg, #6db3f2, #1e69de)";

  if (avatarUrl) {
    profilePfp.innerHTML = `<img src="${avatarUrl}" alt="pfp">`;
  } else {
    profilePfp.innerText = user[0].toUpperCase();
  }

  const isOnline = isUserOnline(user);
  profileUsername.innerText = user;
  profileStatus.innerText = isOnline ? "Online" : "Offline";
  profileStatus.className = "profile-status " + (isOnline ? "online" : "offline");
}

function closeProfile() {
  profileOverlay.classList.remove("show");
  viewedUser = null;
}

if (dmUserBtn) {
  dmUserBtn.addEventListener("click", () => {
    if (!viewedUser) return;
    startChatWith(viewedUser);
    closeProfile();
  });
}

if (profileMsgInput) {
  profileMsgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!viewedUser) return;
      startChatWith(viewedUser);
      closeProfile();
    }
  });
}

if (addFriendBtn) {
  addFriendBtn.addEventListener("click", () => {
    alert(`Friend request sent to ${viewedUser}`);
  });
}

function startChatWith(user) {
  const room = `dm-${[username, user].sort().join("-")}`;
  conversations[room] = { name: user, preview: "" };
  saveConversations();
  loadConversations();
  switchRoom(room);
}
