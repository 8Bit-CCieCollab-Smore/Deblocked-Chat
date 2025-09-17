import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;

// === Resolve paths ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const messagesFile = path.join(__dirname, "messages.json");

// === CORS allowed origins ===
const allowedOrigins = [
  "https://deblocked-chat.onrender.com",
  "https://deblocked-chat.netlify.app",
  "https://codepen.io",
  "https://cdpn.io",
  "http://localhost:3000",
  "https://YOUR-REPL-URL.repl.co"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((o) => origin.startsWith(o))) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// === Load messages from file ===
let messages = [];
try {
  if (fs.existsSync(messagesFile)) {
    messages = JSON.parse(fs.readFileSync(messagesFile, "utf-8"));
  }
} catch (err) {
  console.error("Error reading messages.json:", err);
}

// === Save messages helper ===
function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

// === API Routes ===
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

app.post("/api/messages", (req, res) => {
  const newMessage = {
    user: req.body.user || "anon",
    text: req.body.text?.slice(0, 350) || "",
    color: req.body.color || "#fff",
    timestamp: Date.now(),
  };

  if (newMessage.text.trim()) {
    messages.push(newMessage);

    // Keep only last 150 messages
    if (messages.length > 150) {
      messages = messages.slice(-150);
    }

    saveMessages();

    // Broadcast to WebSocket clients
    broadcast({ type: "message", payload: newMessage });
  }

  res.json({ status: "ok" });
});

// === Serve frontend (index.html in /public) ===
app.use(express.static(path.join(__dirname, "public")));

// === Start server ===
const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

// === Broadcast helper ===
function broadcast(data) {
  const str = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(str);
    }
  });
}

// === Online counter ===
function broadcastOnlineCount() {
  broadcast({ type: "onlineCount", count: wss.clients.size });
}

wss.on("connection", (ws) => {
  broadcastOnlineCount();
  ws.on("close", () => {
    broadcastOnlineCount();
  });
});
