import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";

const app = express();
const PORT = process.env.PORT || 3000;

// Allow Netlify frontend to call API
app.use(cors());
app.use(express.json());

// Store messages in memory
const MAX_MESSAGES = 10000;
let messages = [];

// API: Get messages
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

// API: Post a new message
app.post("/api/messages", (req, res) => {
  const newMessage = {
    user: req.body.user || "anon",
    text: req.body.text,
    timestamp: Date.now(),
  };

  messages.push(newMessage);
  if (messages.length > MAX_MESSAGES) {
    messages.shift();
  }

  // Broadcast to WebSocket clients
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify(newMessage));
    }
  });

  res.json({ status: "ok" });
});

// Ping endpoint for uptime monitoring
app.get("/ping", (req, res) => res.send("pong"));

const server = app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);

const wss = new WebSocketServer({ server });
