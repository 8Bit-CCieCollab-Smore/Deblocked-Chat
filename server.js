import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const MAX_MESSAGES = 10000;
const MAX_LENGTH = 350;
let messages = [];

app.get("/api/messages", (req, res) => {
  res.json(messages);
});

app.post("/api/messages", (req, res) => {
  let { user, text, color } = req.body;

  if (!text || text.trim() === "") {
    return res.status(400).json({ error: "Message cannot be empty" });
  }
  if (text.length > MAX_LENGTH) {
    return res.status(400).json({ error: `Message too long (max ${MAX_LENGTH} characters)` });
  }

  if (!user || user.trim() === "") user = "anon";
  if (!color) color = "#000";

  const newMessage = {
    user,
    text: text.trim(),
    color,
    timestamp: Date.now(),
  };

  messages.push(newMessage);
  if (messages.length > MAX_MESSAGES) {
    messages.shift();
  }

  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(newMessage));
    }
  });

  res.json({ status: "ok" });
});

app.get("/ping", (req, res) => res.send("pong"));

const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });

// Track online users
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
