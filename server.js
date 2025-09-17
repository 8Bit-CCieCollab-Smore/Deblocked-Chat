const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory stores ---
const rooms = { global: [] };            // room -> [{user,text,avatar,timestamp}]
const onlineUsers = new Map();           // username -> lastSeenTimestamp (ms)

// --- Helpers ---
function pruneOldOnline(thresholdMs = 30000) {
  const now = Date.now();
  for (const [user, ts] of onlineUsers.entries()) {
    if (now - ts > thresholdMs) {
      onlineUsers.delete(user);
    }
  }
}

function onlineCount() {
  pruneOldOnline();
  return onlineUsers.size;
}

// --- Messages API ---
app.get("/api/messages/:room", (req, res) => {
  const { room } = req.params;
  if (!rooms[room]) rooms[room] = [];
  res.json(rooms[room]);
});

app.post("/api/messages/:room", (req, res) => {
  const { room } = req.params;
  const { user, text, avatar, timestamp } = req.body || {};
  if (!user || !text) return res.status(400).json({ error: "user and text required" });

  if (!rooms[room]) rooms[room] = [];
  rooms[room].push({
    user,
    text,
    avatar: avatar || null,
    timestamp: timestamp || Date.now(),
  });
  // keep last 200 messages per room
  if (rooms[room].length > 200) rooms[room] = rooms[room].slice(-200);

  res.json({ ok: true });
});

// --- Check user (very permissive for now) ---
app.get("/api/checkUser/:user", (req, res) => {
  const { user } = req.params;
  if (!user || !user.trim()) return res.status(400).json({ exists: false });
  // If you'd rather require "online", uncomment below:
  // pruneOldOnline();
  // return onlineUsers.has(user) ? res.json({ exists: true }) : res.status(404).json({ exists: false });
  return res.json({ exists: true });
});

// --- Presence API ---
app.post("/api/online/ping", (req, res) => {
  const { user } = req.body || {};
  if (!user) return res.status(400).json({ error: "user required" });
  onlineUsers.set(user, Date.now());
  res.json({ count: onlineCount() });
});

app.post("/api/online/leave", (req, res) => {
  const { user } = req.body || {};
  if (user) onlineUsers.delete(user);
  res.json({ ok: true, count: onlineCount() });
});

app.get("/api/online", (req, res) => {
  res.json({ count: onlineCount() });
});

// --- Fallback to index.html (optional SPA behavior) ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
