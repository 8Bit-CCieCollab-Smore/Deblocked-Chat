import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "5mb" })); // increased limit for images/files
app.use(express.static(path.join(__dirname, "public")));

// --- In-memory stores ---
const rooms = { global: [] };          // roomId -> [{user,text,avatar,timestamp,file,fileName}]
const onlineUsers = new Map();         // username -> lastSeenTimestamp (ms)
const userRooms = new Map();           // username -> Set(roomIds)

// --- Helpers ---
function pruneOldOnline(thresholdMs = 30000) {
  const now = Date.now();
  for (const [user, ts] of onlineUsers.entries()) {
    if (now - ts > thresholdMs) onlineUsers.delete(user);
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
  const { user, text, avatar, timestamp, file, fileName } = req.body || {};
  if (!user || (!text && !file)) return res.status(400).json({ error: "text or file required" });

  if (!rooms[room]) rooms[room] = [];
  rooms[room].push({ user, text, avatar, timestamp: timestamp || Date.now(), file, fileName });

  if (rooms[room].length > 200) rooms[room] = rooms[room].slice(-200);
  res.json({ ok: true });
});

// --- DM Creation ---
app.post("/api/dm/create", (req, res) => {
  const { users } = req.body; // expect [user1, user2]
  if (!users || users.length !== 2) return res.status(400).json({ error: "Two users required" });

  const sorted = users.sort();
  const roomId = `dm-${sorted.join("-")}`;
  if (!rooms[roomId]) rooms[roomId] = [];

  // Add room to both users
  sorted.forEach(u => {
    if (!userRooms.has(u)) userRooms.set(u, new Set());
    userRooms.get(u).add(roomId);
  });

  res.json({ ok: true, roomId });
});

// --- Check user ---
app.get("/api/checkUser/:user", (req, res) => {
  const { user } = req.params;
  if (!user || !user.trim()) return res.status(400).json({ exists: false });
  res.json({ exists: true });
});

// --- Get user rooms (for DM tabs) ---
app.get("/api/userRooms/:user", (req, res) => {
  const { user } = req.params;
  if (!user) return res.json({ rooms: [] });
  const roomsSet = userRooms.get(user);
  res.json({ rooms: roomsSet ? Array.from(roomsSet) : [] });
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

// --- Fallback to index.html ---
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
