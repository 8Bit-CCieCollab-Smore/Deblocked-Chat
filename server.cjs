// server.cjs
// Deblocked Chat V3 — CommonJS + SQLite persistence
// deps: express, socket.io, multer, uuid, cors, sqlite3, helmet (optional)
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

// Config
const PORT = process.env.PORT || 8080;
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const MAX_UPLOAD_MB = 10;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Ensure upload dir exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Setup DB (messages + users)
const DB_FILE = path.join(__dirname, "messages.db");
const db = new sqlite3.Database(DB_FILE);
db.serialize(() => {
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
    )`);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      color TEXT,
      avatar TEXT,
      lastSeen INTEGER
    )`);
});

// Multer
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

// Express
const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, fp) => {
    if (fp.includes("/uploads/")) res.setHeader("Cache-Control", "no-store");
    else res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  },
}));

// Upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// History endpoint (last N)
app.get("/history", (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit) || 200);
  db.all("SELECT * FROM messages ORDER BY createdAt ASC LIMIT ?", [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: "db error" });
    res.json({ messages: rows || [] });
  });
});

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true }, transports: ["websocket", "polling"] });

const socketsToUser = new Map(); // socket.id => user {id,name,color,avatar}
const onlineUsers = new Map(); // userId => user

function now() { return Date.now(); }
function makeSystem(text) {
  return { id: uuidv4(), system: true, text, createdAt: now() };
}

// Save message into DB
function saveMessage(msg, cb) {
  const stmt = db.prepare(`INSERT INTO messages (id,userId,name,color,avatar,text,attachment,createdAt) VALUES (?,?,?,?,?,?,?,?)`);
  stmt.run(msg.id, msg.user.id, msg.user.name, msg.user.color, msg.user.avatar || "", msg.text || "", msg.attachment?.url || null, msg.createdAt, function (err) {
    stmt.finalize();
    cb && cb(err);
  });
}

// Upsert user profile
function upsertUser(u) {
  const stmt = db.prepare(`INSERT INTO users (id,name,color,avatar,lastSeen) VALUES (?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name, color=excluded.color, avatar=excluded.avatar, lastSeen=excluded.lastSeen`);
  stmt.run(u.id, u.name, u.color || "#7b61ff", u.avatar || "", now(), (err) => stmt.finalize());
}

// Socket events
io.on("connection", (socket) => {
  socket.on("join", async (payload, ack) => {
    try {
      const userId = payload?.id || uuidv4();
      const name = String(payload?.name || "Guest").slice(0, 64);
      const color = String(payload?.color || "#7b61ff").slice(0, 32);
      const avatar = String(payload?.avatar || "").slice(0, 512);

      const user = { id: userId, name, color, avatar };
      socketsToUser.set(socket.id, user);
      onlineUsers.set(user.id, user);

      // upsert into users table
      upsertUser(user);

      // send history (last 200)
      db.all("SELECT * FROM messages ORDER BY createdAt ASC LIMIT 200", [], (err, rows) => {
        if (err) rows = [];
        socket.emit("history", rows || []);
        // broadcast join
        socket.broadcast.emit("presence:user-joined", { user });
        io.emit("message:new", makeSystem(`${user.name} joined`));
        io.emit("presence:list", Array.from(onlineUsers.values()));
        ack && ack({ ok: true, user, online: Array.from(onlineUsers.values()) });
      });
    } catch (e) {
      ack && ack({ ok: false, error: e.message });
    }
  });

  socket.on("message:send", (payload, ack) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return ack && ack({ ok: false, error: "not joined" });

    // rate-limit per socket (very light)
    const last = socket._lastMsgAt || 0;
    const nowTs = Date.now();
    if (nowTs - last < 300) return ack && ack({ ok: false, error: "slow down" });
    socket._lastMsgAt = nowTs;

    const text = payload?.text ? String(payload.text).slice(0, 2000) : "";
    const attachment = payload?.attachment?.url ? { url: payload.attachment.url } : null;
    if (!text && !attachment) return ack && ack({ ok: false, error: "empty" });

    const msg = {
      id: uuidv4(),
      user: { id: u.id, name: u.name, color: u.color, avatar: u.avatar },
      text,
      attachment,
      createdAt: nowTs,
    };

    // persist
    saveMessage(msg, (err) => {
      // broadcast after inserted (best-effort)
      io.emit("message:new", msg);
      ack && ack({ ok: true, id: msg.id });
    });
  });

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

  socket.on("presence:typing", (isTyping) => {
    const u = socketsToUser.get(socket.id);
    if (!u) return;
    socket.broadcast.emit("presence:typing", { userId: u.id, name: u.name, isTyping: !!isTyping });
  });

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

// Health
app.get("/health", (_, res) => res.json({ ok: true }));

server.listen(PORT, () => {
  console.log(`✅ Chat server running on port ${PORT}`);
});
