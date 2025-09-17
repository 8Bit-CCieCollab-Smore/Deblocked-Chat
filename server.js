import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 8080;

// === Allowed CORS origins ===
const allowedOrigins = [
  "https://deblocked-chat.onrender.com",
  "https://deblocked-chat.netlify.app",
  "https://codepen.io",
  "https://cdpn.io",
  "http://localhost:3000"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true); // allow server-to-server calls
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

// === Messages in memory ===
const MAX_MESSAGES = 1000;
let messages = [];

// === API Routes ===
app.get("/api/messages", (req, res) => {
  res.json(messages);
});

app.post("/api/messages", (req, res) => {
  const newMessage = {
    user: req.body.user || "anon",
    text: req.body.text?.slice(0, 350) || "", // enforce 350-char cap
    color: req.body.color || "#fff",
    timestamp: Date.now(),
  };

  if (newMessage.text.trim()) {
    messages.push(newMessage);
    if (messages.length > MAX_MESSAGES) {
      messages.shift();
    }

    // Broadcast new message to all WS clients
    broadcast({ type: "message", payload: newMessage });
  }

  res.json({ status: "ok" });
});

// === Serve frontend (index.html in /public) ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
