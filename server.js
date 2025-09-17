import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Allowed origins (add Neocities + localhost for dev)
const allowedOrigins = [
  "https://deblocked.neocities.org", // your Neocities site
  "http://localhost:3000"
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS: " + origin));
    }
  }
}));

app.use(express.json());

// 🔒 Config
const MAX_MESSAGES = 10000;
const MAX_LENGTH = 350;
let messages = [];

// 📥 Get history
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

// 📤 Post new message
app.post("/api/messages", (req, res) => {
  let { user, text, color } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Message cannot be empty" });
  }
  if (text.length > MAX_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_LENGTH} chars)` });
  }
  if (!user || user.trim() === "") user = "anon";
  if (!color) color = "#000";

  const newMessage = {
    type: "message",
    user,
    text: text.trim(),
    color,
    timestamp: Date.now(),
  };

  messages.push(newMessage);
  if (messages.length > MAX_MESSAGES) {
    messages.shift();
  }

  // Broadcast via WebSocket
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(newMessage));
    }
  });

  res.json({ status: "ok" });
});

// 🔄 Keepalive ping
app.get("/ping", (req, res) => res.send("pong"));

const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

// 🟣 WebSocket
const wss = new WebSocketServer({ server });

function broadcastUserCount() {
  const count = [...wss.clients].filter(c => c.readyState === 1).length;
  const data = JSON.stringify({ type: "userCount", count });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(data);
  });
}

wss.on("connection", (ws) => {
  broadcastUserCount();
  ws.on("close", broadcastUserCount);
});
