import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import url from "url";

const app = express();
const PORT = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, "messages.json");

// ---- In-memory state ----
let messages = {};                // { roomId: [ {user,text,color,timestamp} ] }
const MAX_PER_ROOM = 150;
const onlineUsers = new Set();    // usernames online right now

// ---- Load persisted messages ----
try {
  if (fs.existsSync(DATA_FILE)) {
    messages = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8") || "{}");
  } else {
    messages = {};
  }
} catch (e) {
  console.error("Failed to load messages.json:", e);
  messages = {};
}

const saveMessages = () => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messages, null, 2));
  } catch (e) {
    console.error("Failed to save messages.json:", e);
  }
};

app.use(cors());
app.use(express.json());

// ---- API ----

// Get messages for a room
app.get("/api/messages/:roomId", (req, res) => {
  const { roomId } = req.params;
  res.json(messages[roomId] || []);
});

// Post a new message to a room
app.post("/api/messages/:roomId", (req, res) => {
  const { roomId } = req.params;
  const { user, text, color } = req.body || {};

  if (!roomId) return res.status(400).json({ error: "roomId required" });
  const trimmed = (text || "").toString().slice(0, 350).trim();
  if (!trimmed) return res.json({ status: "ignored" });

  const msg = {
    user: (user || "anon").toString().slice(0, 40),
    text: trimmed,
    color: color || "#fff",
    timestamp: Date.now(),
  };

  if (!messages[roomId]) messages[roomId] = [];
  messages[roomId].push(msg);
  if (messages[roomId].length > MAX_PER_ROOM) {
    messages[roomId] = messages[roomId].slice(-MAX_PER_ROOM);
  }
  saveMessages();

  broadcast(roomId, { type: "message", payload: msg });
  return res.json({ status: "ok" });
});

// User online check (for DM creation)
app.get("/api/users/:name/exists", (req, res) => {
  const name = (req.params.name || "").trim();
  res.json({ exists: onlineUsers.has(name) });
});

// Serve static
app.use(express.static(path.join(__dirname, "public")));

const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

// ---- WebSockets ----
const wss = new WebSocketServer({ server });

function broadcast(roomId, data) {
  const payload = JSON.stringify({ roomId, ...data });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

function broadcastOnlineCount() {
  const count = wss.clients.size;
  broadcast("global", { type: "onlineCount", count });
}

wss.on("connection", (ws, req) => {
  // parse ?user=...
  const parsed = url.parse(req.url, true);
  const who = (parsed?.query?.user || "").toString().slice(0, 40).trim();
  if (who) {
    onlineUsers.add(who);
  }
  broadcastOnlineCount();

  ws.on("close", () => {
    if (who) onlineUsers.delete(who);
    broadcastOnlineCount();
  });
});
