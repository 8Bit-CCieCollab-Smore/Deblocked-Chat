import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const messagesFile = path.join(__dirname, "messages.json");

app.use(cors());
app.use(express.json());

// === Load persisted messages ===
let messages = {};
try {
  if (fs.existsSync(messagesFile)) {
    messages = JSON.parse(fs.readFileSync(messagesFile, "utf-8"));
  }
} catch (err) {
  console.error("Error loading messages.json:", err);
}
function saveMessages() {
  fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
}

// === REST API ===
// Get messages for a room
app.get("/api/messages/:roomId", (req, res) => {
  const { roomId } = req.params;
  res.json(messages[roomId] || []);
});

// Post message to a room
app.post("/api/messages/:roomId", (req, res) => {
  const { roomId } = req.params;
  if (!messages[roomId]) messages[roomId] = [];

  const newMessage = {
    user: req.body.user || "anon",
    text: req.body.text?.slice(0, 350) || "",
    color: req.body.color || "#fff",
    timestamp: Date.now(),
  };

  if (newMessage.text.trim()) {
    messages[roomId].push(newMessage);

    // Keep last 150 per room
    if (messages[roomId].length > 150) {
      messages[roomId] = messages[roomId].slice(-150);
    }

    saveMessages();
    broadcast(roomId, { type: "message", payload: newMessage });
  }

  res.json({ status: "ok" });
});

// Serve frontend
app.use(express.static(path.join(__dirname, "public")));

// Start server
const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

// === Broadcast helper ===
function broadcast(roomId, data) {
  const str = JSON.stringify({ roomId, ...data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(str);
    }
  });
}

function broadcastOnlineCount() {
  const count = wss.clients.size;
  broadcast("global", { type: "onlineCount", count });
}

wss.on("connection", (ws) => {
  broadcastOnlineCount();
  ws.on("close", () => {
    broadcastOnlineCount();
  });
});
