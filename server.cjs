// server.cjs
// Deblocked Chat V3 — CommonJS + SQLite persistence (Railway/Fly-ready)
// deps: express, socket.io, multer, uuid, cors, sqlite3, helmet

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

// Mutable data (DB + uploads). For Fly/Railway you can mount a volume to /data.
// e.g. Fly: fly volumes create chat_data --size 1
//       in fly.toml: [mounts] source="chat_data" destination="/data"
const DATA_DIR = process.env.DATA_DIR || "/data";

// Public static assets (read-only inside the image)
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

db.serialize(() => {
  // Pragmas tuned for containers and light concurrency
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
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_userId   ON messages(userId);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_users_lastSeen     ON users(lastSeen);`);
});

// -------------------------
// Multer (uploads -> /data/uploads)
// -------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const id = uuidv4();
    const ext = path.extname(file.originalname || "");
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error("Unsupported file type"));
    cb(null, true);
  },
});

// -------------------------
// Express app
// -------------------------
const app = express();

/**
 * Security headers
 * - We explicitly allow embedding (iframes) everywhere by setting:
 *   - helmet({ frameguard:false }) to avoid X-Frame-Options: SAMEORIGIN
 *   - CSP "frame-ancestors *"
 * - We also allow inline styles (for your CSS), inline/eval scripts (socket.io client when bundled),
 *   websocket/http(s) connects, and data/blob images.
 */
app.use(
  helmet({
    frameguard: false, // DO NOT send X-Frame-Options
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "media-src": ["'self'", "data:", "blob:"],
        "font-src": ["'self'", "data:"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        // allow same-origin sockets + if your parent page is different origin, this still works
        // because the iframe loads your origin and connects back to it.
        "connect-src": ["'self'", "https:", "http:", "wss:", "ws:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        // THIS is what actually controls who can embed you:
        "frame-ancestors": ["*"],
      },
    },
    // Avoid COEP/COOP iframe issues in some hosts
    crossOriginEmbedderPolicy: false,
  })
);

// In case any upstream proxy injects X-Frame-Options, strip/override it.
app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  // Keep frame-ancestors extremely permissive for embedding anywhere
  // (Helmet already set CSP above; this ensures nothing upstream overrides it)
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; " +
    "img-src 'self' data: blob:; " +
    "media-src 'self' data: blob:; " +
    "font-src 'self' data:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "connect-src 'self' https: http: wss: ws:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "frame-ancestors *;"
  );
  next();
});

// CORS for XHR/WebSocket (embedding does not depend on CORS, but uploads/history do)
app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Static assets (read-only app bundle)
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      // Long cache for the app bundle
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      // Never set X-Frame-Options here either
      res.removeHeader("X-Frame-Options");
    },
  })
);

// Serve uploaded avatars/images from the writable volume under /uploads
app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    setHeaders: (res) => {
      // Uploaded files can change; don't cache aggressively
      res.setHeader("Cache-Control", "no-store");
      res.removeHeader("X-Frame-Options");
    },
  })
);

// -------------------------
// Endpoints
// -------------------------

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// Version (optional quick check)
app.get("/version", (_req, res) => res.json({ name: "Deblocked Chat V3", version: "1.0.0" }));

// Upload endpoint
app.post("/upload", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err.message === "File too large") {
        return res.status(413).json({ error: "File too large" });
      }
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

  const sql =
    since > 0
      ? `SELECT * FROM messages WHERE createdAt > ? ORDER BY createdAt ASC LIMIT ?`
      : `SELECT * FROM messages ORDER BY createdAt ASC LIMIT ?`;

  const params = since > 0 ? [since, limit] : [limit];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "db error" });
    res.json({ messages: rows || [] });
  });
});

// Snapshot of online users (best-effort)
app.get("/online", (_req, res) => {
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

// Presence maps (in-memory)
const socketsToUser = new Map(); // socket.id => user {id,name,color,avatar}
const onlineUsers = new Map();   // userId => user

function now() {
  return Date.now();
}
function makeSystem(text) {
  return { id: uuidv4(), system: true, text, createdAt: now() };
}

// Persist message
function saveMessage(msg, cb) {
  const stmt = db.prepare(`
    INSERT INTO messages (id, userId, name, color, avatar, text, attachment, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
      if (cb) cb(err);
    }
  );
}

// Upsert user profile
function upsertUser(u) {
  const stmt = db.prepare(`
    INSERT INTO users (id, name, color, avatar, lastSeen)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      color = excluded.color,
      avatar = excluded.avatar,
      lastSeen = excluded.lastSeen
  `);
  stmt.run(u.id, u.name, u.color || "#7b61ff", u.avatar || "", now(), (err) => {
    stmt.finalize();
    if (err) console.error("users upsert error:", err);
  });
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

      // Send initial history (last 200 messages)
      db.all("SELECT * FROM messages ORDER BY createdAt ASC LIMIT 200", [], (err, rows) => {
        const history = err ? [] : rows || [];
        socket.emit("history", history);

        // Broadcast presence
        socket.broadcast.emit("presence:user-joined", { user });
        io.emit("message:new", makeSystem(`${user.name} joined`));
        io.emit("presence:list", Array.from(onlineUsers.values()));

        if (ack) ack({ ok: true, user, online: Array.from(onlineUsers.values()) });
      });
    } catch (e) {
      if (ack) ack({ ok: false, error: e.message });
    }
  });

  // Send message
  socket.on("message:send", (payload, ack) => {
    const u = socketsToUser.get(socket.id);
    if (!u) {
      if (ack) ack({ ok: false, error: "not joined" });
      return;
    }

    // simple per-socket rate limit
    const last = socket._lastMsgAt || 0;
    const nowTs = Date.now();
    if (nowTs - last < 300) {
      if (ack) ack({ ok: false, error: "slow down" });
      return;
    }
    socket._lastMsgAt = nowTs;

    const text = payload?.text ? String(payload.text).slice(0, 2000) : "";
    const attachment =
      payload?.attachment?.url ? { url: String(payload.attachment.url).slice(0, 1024) } : null;

    if (!text && !attachment) {
      if (ack) ack({ ok: false, error: "empty" });
      return;
    }

    const msg = {
      id: uuidv4(),
      user: { id: u.id, name: u.name, color: u.color, avatar: u.avatar },
      text,
      attachment,
      createdAt: nowTs,
    };

    saveMessage(msg, () => {
      io.emit("message:new", msg);
      if (ack) ack({ ok: true, id: msg.id });
    });
  });

  // Update settings (name, color, avatar)
  socket.on("settings:update", (partial, ack) => {
    const u = socketsToUser.get(socket.id);
    if (!u) {
      if (ack) ack({ ok: false });
      return;
    }

    if (typeof partial?.name === "string") u.name = partial.name.slice(0, 64) || u.name;
    if (typeof partial?.color === "string") u.color = partial.color.slice(0, 32);
    if (typeof partial?.avatar === "string") u.avatar = partial.avatar.slice(0, 512);

    socketsToUser.set(socket.id, u);
    onlineUsers.set(u.id, u);
    upsertUser(u);

    io.emit("presence:user-updated", { user: u });
    io.emit("presence:list", Array.from(onlineUsers.values()));
    if (ack) ack({ ok: true, user: u });
  });

  // Typing indicator
  socket.on("presence:typing", (isTyping) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return;
    socket.broadcast.emit("presence:typing", {
      userId: u.id,
      name: u.name,
      isTyping: !!isTyping,
    });
  });

  // Disconnect
  socket.on("disconnect", () => {
    const u = socketsToUser.get(socket.id);
    if (!u) return;

    socketsToUser.delete(socket.id);
    onlineUsers.delete(u.id);

    socket.broadcast.emit("presence:user-left", { userId: u.id, name: u.name });
    io.emit("message:new", makeSystem(`${u.name} left`));
    io.emit("presence:list", Array.from(onlineUsers.values()));
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
