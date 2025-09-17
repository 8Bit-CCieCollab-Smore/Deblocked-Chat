<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Deblocked Chat</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #1e1e1e;
      color: #fff;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    header {
      background: #272727;
      padding: 10px;
      font-size: 1.5em;
      text-align: center;
    }
    #chat-box {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      background: #121212;
      border-top: 1px solid #333;
      border-bottom: 1px solid #333;
      font-size: 14px;
    }
    .message {
      margin-bottom: 6px;
    }
    .username {
      font-weight: bold;
    }
    #controls {
      display: flex;
      padding: 10px;
      background: #1e1e1e;
      border-top: 1px solid #333;
    }
    input[type="text"] {
      padding: 8px;
      margin-right: 8px;
      border: none;
      border-radius: 4px;
      flex: 1;
    }
    #send-btn {
      background: #4CAF50;
      color: white;
      border: none;
      padding: 8px 15px;
      border-radius: 4px;
      cursor: pointer;
    }
    #send-btn:disabled {
      background: #777;
      cursor: not-allowed;
    }
    #status-bar {
      text-align: center;
      padding: 5px;
      font-size: 13px;
      background: #272727;
      border-top: 1px solid #333;
    }
  </style>
</head>
<body>
  <header>Deblocked Chat</header>

  <div id="status-bar">Connecting...</div>

  <div id="chat-box"></div>

  <div id="controls">
    <input type="text" id="username" placeholder="Enter username" />
    <input type="text" id="message" placeholder="Type a message" maxlength="350" />
    <button id="send-btn" disabled>Send</button>
  </div>

  <script>
    // === CONFIG ===
    const API_URL = "https://deblocked-chat.onrender.com";
    const WS_URL = "wss://deblocked-chat.onrender.com";

    // === STATE ===
    let username = "";
    let socket;
    let onlineCount = 0;
    const colors = [
      "#e6194B", "#3cb44b", "#ffe119", "#4363d8",
      "#f58231", "#911eb4", "#46f0f0", "#f032e6",
      "#bcf60c", "#fabebe", "#008080", "#e6beff",
      "#9A6324", "#fffac8", "#800000", "#aaffc3",
      "#808000", "#ffd8b1", "#000075", "#808080",
      "#ff0000", "#00ff00", "#0000ff", "#ffff00",
      "#00ffff", "#ff00ff", "#ff8800", "#88ff00",
      "#0088ff", "#ff0088", "#44ff44", "#8888ff"
    ];
    let userColor = colors[Math.floor(Math.random() * colors.length)];

    const chatBox = document.getElementById("chat-box");
    const usernameInput = document.getElementById("username");
    const messageInput = document.getElementById("message");
    const sendBtn = document.getElementById("send-btn");
    const statusBar = document.getElementById("status-bar");

    // === FUNCTIONS ===
    function addMessage(user, text, color) {
      const div = document.createElement("div");
      div.classList.add("message");
      div.innerHTML = `<span class="username" style="color:${color}">${user}:</span> ${text}`;
      chatBox.appendChild(div);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    function connectSocket() {
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        statusBar.textContent = "✅ Connected";
      };

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        addMessage(msg.user, msg.text, msg.color || "#fff");
      };

      socket.onclose = () => {
        statusBar.textContent = "❌ Disconnected. Reconnecting...";
        setTimeout(connectSocket, 3000);
      };
    }

    // === EVENTS ===
    usernameInput.addEventListener("blur", () => {
      if (usernameInput.value.trim() && !username) {
        username = usernameInput.value.trim();
        usernameInput.disabled = true;
      }
    });

    messageInput.addEventListener("input", () => {
      sendBtn.disabled = messageInput.value.trim() === "" || !username;
    });

    messageInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !sendBtn.disabled) {
        sendMessage();
      }
    });

    sendBtn.addEventListener("click", sendMessage);

    function sendMessage() {
      const text = messageInput.value.trim();
      if (!text || !username) return;

      const newMessage = { user: username, text, color: userColor };
      fetch(API_URL + "/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newMessage)
      });

      messageInput.value = "";
      sendBtn.disabled = true;
    }

    // === INIT ===
    connectSocket();

    // Load existing messages
    fetch(API_URL + "/api/messages")
      .then(res => res.json())
      .then(msgs => msgs.forEach(m => addMessage(m.user, m.text, m.color || "#fff")));
  </script>
</body>
</html>
