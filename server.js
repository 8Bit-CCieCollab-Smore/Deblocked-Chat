import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// === CORS allowed origins ===
const allowedOrigins = [
  "https://deblocked-chat.onrender.com", // Render frontend
  "https://deblocked-chat.netlify.app",  // Netlify frontend
  "https://codepen.io",                  // CodePen editor
  "https://cdpn.io",                     // CodePen fullpage + debug
  "http://localhost:3000"                // Local dev
];

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow server-to-server requests (like Postman) with no origin
      if (!origin) return callback(null, true);

      // Check if request origin starts with an allowed origin
      if (allowedOrigins.some(o => origin.startsWith(o))) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true
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
    text: req.body.text?.slice(0, 350) || "", // cap 350 chars
    color: req.body.color || "#fff",
    timestamp: Date.now(),
  };

  if (newMessage.text.trim()) {
    messages.push(newMessage);
    if (messages.length > MAX_MESSAGES) {
      messages.shift();
    }

    // Broadcast new message
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(newMessage));
      }
    });
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

// === WebSocket connection tracking ===
function broadcastOnlineCount() {
  const count = wss.clients.size;
  const msg = JSON.stringify({ type: "onlineCount", count });
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(msg);
    }
  });
}

wss.on("connection", (ws) => {
  broadcastOnlineCount();

  ws.on("close", () => {
    broadcastOnlineCount();
  });
});
