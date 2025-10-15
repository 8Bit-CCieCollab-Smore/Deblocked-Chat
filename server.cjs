// server.cjs
// Deblocked Chat V3 — CommonJS + SQLite persistence (Fly-ready)
//
// deps: express, socket.io, multer, uuid, cors, sqlite3, helmet (optional)
// make sure sqlite3 is in "dependencies" and Dockerfile installs build tools.

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const helmet = require("helmet");

// -------------------------
// Config
// -------------------------
const PORT = process.env.PORT || 8080;

// Where to store *mutable* data (DB + uploaded avatars)
// On Fly, mount a volume to /data and (optionally) set DATA_DIR.
// e.g. fly volumes create chat_data --size 1
// and in fly.toml: [mounts] source="chat_data" destination="/data"
const DATA_DIR = process.env.DATA_DIR || "/data";

// Public static assets (built-in, read-only in container)
const PUBLIC_DIR = path.join(__dirname, "public");

// Ensure data dirs exist
fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Upload constraints
const MAX_UPLOAD_MB = 10;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// -------------------------
// SQLite setup
// -------------------------
const DB_FILE = path.join(DATA_DIR, "messages.db");
const db = new sqlite3.Database(DB_FILE);

// Performance and safety pragmas
db.serialize(() => {
  db.run(`PRAGMA journal_mode = WAL;`);
  db.run(`PRAGMA synchronous = NORMAL;`);
  db.run(`PRAGMA foreign_keys = ON;`);
  db.run(`PRAGMA busy_timeout = 3000;`);

  // Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT,
      color TEXT,
      avatar TEXT,
      text TEXT,
      attachment TEXT,
      createdAt INTEGER
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      avatar TEXT,
      lastSeen INTEGER
    );
  `);

  // Helpful indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_createdAt ON messages(createdAt);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_userId ON messages(userId);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_lastSeen ON users(lastSeen);`);
});

// -------------------------
// Multer (file uploads -> /data/uploads)
// -------------------------
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname || "");
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// -------------------------
// Express app
// -------------------------
const app = express();

// Security & basics
app.use(helmet({
  contentSecurityPolicy: false, // keep simple for sockets & inline previews; tighten if you want
}));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static assets (read-only app bundle)
app.use(express.static(PUBLIC_DIR, {
  setHeaders: (res, fp) => {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// Serve uploaded avatars/images from the writable volume under /uploads
// Example URL returned to clients: /uploads/<filename>
app.use("/uploads", express.static(UPLOAD_DIR, {
  setHeaders: (res) => {
    // uploaded files can change; don't cache aggressively
    res.setHeader("Cache-Control", "no-store");
  },
}));

// -------------------------
// Endpoints
// -------------------------

// Health
app.get("/health", (_, res) => res.json({ ok: true }));

// Version (optional quick check)
app.get("/version", (_, res) => res.json({ name: "Deblocked Chat V3", version: "1.0.0" }));

// Upload endpoint
app.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message === "File too large") return res.status(413).json({ error: "File too large" });
      return res.status(400).json({ error: err.message || "Upload error" });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  });
});

// History endpoint
// Supports ?limit= and optional ?since=timestamp (ms) to fetch only new messages
app.get("/history", (req, res) => {
  const limit = Math.min(500, parseInt(req.query.limit, 10) || 200);
  const since = parseInt(req.query.since, 10) || 0;

  const sql = since > 0
    ? `SELECT * FROM messages WHERE createdAt > ? ORDER BY createdAt ASC LIMIT ?`
    : `SELECT * FROM messages ORDER BY createdAt ASC LIMIT ?`;

  const params = since > 0 ? [since, limit] : [limit];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "db error" });
    res.json({ messages: rows || [] });
  });
});

// List online users snapshot
app.get("/online", (_, res) => {
  res.json({ online: Array.from(onlineUsers.values()) });
});

// -------------------------
// HTTP + Socket.IO
// -------------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
});

// In-memory presence
const socketsToUser = new Map(); // socket.id => user {id,name,color,avatar}
const onlineUsers = new Map();   // userId => user

function now() { return Date.now(); }
function makeSystem(text) {
  return { id: uuidv4(), system: true, text, createdAt: now() };
}

// Persist message
function saveMessage(msg, cb) {
  const stmt = db.prepare(`
    INSERT INTO messages (id,userId,name,color,avatar,text,attachment,createdAt)
    VALUES (?,?,?,?,?,?,?,?)
  `);
  stmt.run(
    msg.id,
    msg.user.id,
    msg.user.name,
    msg.user.color,
    msg.user.avatar || "",
    msg.text || "",
    msg.attachment?.url || null,
    msg.createdAt,
    function (err) {
      stmt.finalize();
      cb && cb(err);
    }
  );
}

// Upsert user profile
function upsertUser(u) {
  const stmt = db.prepare(`
    INSERT INTO users (id,name,color,avatar,lastSeen)
    VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      color=excluded.color,
      avatar=excluded.avatar,
      lastSeen=excluded.lastSeen
  `);
  stmt.run(u.id, u.name, u.color || "#7b61ff", u.avatar || "", now(), (err) => stmt.finalize());
}

// -------------------------
// Socket events
// -------------------------
io.on("connection", (socket) => {
  // Join
  socket.on("join", async (payload, ack) => {
    try {
      const userId = payload?.id || uuidv4();
      const name = String(payload?.name || "Guest").slice(0, 64);
      const color = String(payload?.color || "#7b61ff").slice(0, 32);
      const avatar = String(payload?.avatar || "").slice(0, 512);
      const user = { id: userId, name, color, avatar };

      socketsToUser.set(socket.id, user);
      onlineUsers.set(user.id, user);
      upsertUser(user);

      // Send initial history (last 200)
      db.all("SELECT * FROM messages ORDER BY createdAt ASC LIMIT 200", [], (err, rows) => {
        const history = err ? [] : (rows || []);
        socket.emit("history", history);

        // Broadcast presence
        socket.broadcast.emit("presence:user-joined", { user });
        io.emit("message:new", makeSystem(`${user.name} joined`));
        io.emit("presence:list", Array.from(onlineUsers.values()));

        ack && ack({ ok: true, user, online: Array.from(onlineUsers.values()) });
      });
    } catch (e) {
      ack && ack({ ok: false, error: e.message });
    }
  });

  // Send message
  socket.on("message:send", (payload, ack) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return ack && ack({ ok: false, error: "not joined" });

    // tiny per-socket rate limit
    const last = socket._lastMsgAt || 0;
    const nowTs = Date.now();
    if (nowTs - last < 300) return ack && ack({ ok: false, error: "slow down" });
    socket._lastMsgAt = nowTs;

    const text = payload?.text ? String(payload.text).slice(0, 2000) : "";
    const attachment = payload?.attachment?.url ? { url: String(payload.attachment.url).slice(0, 1024) } : null;
    if (!text && !attachment) return ack && ack({ ok: false, error: "empty" });

    const msg = {
      id: uuidv4(),
      user: { id: u.id, name: u.name, color: u.color, avatar: u.avatar },
      text,
      attachment,
      createdAt: nowTs,
    };

    saveMessage(msg, () => {
      io.emit("message:new", msg);
      ack && ack({ ok: true, id: msg.id });
    });
  });

  // Update settings (name, color, avatar)
  socket.on("settings:update", (partial, ack) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return ack && ack({ ok: false });

    if (typeof partial?.name === "string") u.name = partial.name.slice(0, 64) || u.name;
    if (typeof partial?.color === "string") u.color = partial.color.slice(0, 32);
    if (typeof partial?.avatar === "string") u.avatar = partial.avatar.slice(0, 512);

    socketsToUser.set(socket.id, u);
    onlineUsers.set(u.id, u);
    upsertUser(u);

    io.emit("presence:user-updated", { user: u });
    io.emit("presence:list", Array.from(onlineUsers.values()));
    ack && ack({ ok: true, user: u });
  });

  // Typing indicator
  socket.on("presence:typing", (isTyping) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return;
    socket.broadcast.emit("presence:typing", { userId: u.id, name: u.name, isTyping: !!isTyping });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const u = socketsToUser.get(socket.id);
    if (u) {
      socketsToUser.delete(socket.id);
      onlineUsers.delete(u.id);
      socket.broadcast.emit("presence:user-left", { userId: u.id, name: u.name });
      io.emit("message:new", makeSystem(`${u.name} left`));
      io.emit("presence:list", Array.from(onlineUsers.values()));
    }
  });
});

// -------------------------
// Start
// -------------------------
server.listen(PORT, () => {
  console.log(`✅ Chat server running on port ${PORT}`);
  console.log(`📀 SQLite DB: ${DB_FILE}`);
  console.log(`🖼️ Uploads dir: ${UPLOAD_DIR}`);
});
