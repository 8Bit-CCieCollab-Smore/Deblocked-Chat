// server.js
// Fast, minimal, production-leaning chat server (Express + Socket.IO + Multer).
// Requires deps: express, socket.io, multer, uuid, cors, helmet (optional but recommended)

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

// ---- Config ----------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const MAX_UPLOAD_MB = 10;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

// Ensure uploads dir exists (inside /public so they’re served statically)
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---- Express ---------------------------------------------------------------
const app = express();

// Light security/CORS that plays nice with iframes and same-origin embeds
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Serve static assets with long cache for immutable files
app.use(
  express.static(path.join(__dirname, "public"), {
    setHeaders: (res, filePath) => {
      if (filePath.includes("/uploads/")) {
        // user uploads: no long cache
        res.setHeader("Cache-Control", "no-store");
      } else {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  })
);

// Basic health check
app.get("/health", (_, res) => res.status(200).json({ ok: true }));

// ---- Multer upload setup ---------------------------------------------------
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
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type"));
    }
    cb(null, true);
  },
});

// Upload endpoint (images only)
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

// ---- HTTP + Socket.IO ------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  transports: ["websocket", "polling"],
});

const users = new Map(); // socket.id -> user {id,name,color,banner,avatar}
const lastMessageAt = new Map(); // rate-limit per socket

function sanitizeText(s) {
  if (!s) return "";
  return String(s).replace(/[<>]/g, "").slice(0, 1000).trim();
}

function systemMessage(text) {
  return {
    id: uuidv4(),
    system: true,
    text,
    createdAt: Date.now(),
  };
}

io.on("connection", (socket) => {
  // Join payload: {name, color, banner, avatar}
  socket.on("join", (payload, ack) => {
    const name = sanitizeText(payload?.name) || "Guest";
    const color = String(payload?.color || "#7b61ff").slice(0, 32);
    const banner = String(payload?.banner || "#2b2b2f").slice(0, 32);
    const avatar = String(payload?.avatar || "").slice(0, 512);

    const user = { id: socket.id, name, color, banner, avatar };
    users.set(socket.id, user);
    socket.data.user = user;

    // notify others
    socket.broadcast.emit("presence:user-joined", {
      user: { id: user.id, name: user.name, color: user.color, avatar: user.avatar },
    });
    io.emit("message:new", systemMessage(`${user.name} joined`));

    if (ack) ack({ ok: true, user, online: Array.from(users.values()) });
  });

  socket.on("presence:typing", (isTyping) => {
    const u = socket.data.user;
    if (!u) return;
    socket.broadcast.emit("presence:typing", { userId: u.id, name: u.name, isTyping: !!isTyping });
  });

  // payload: {text, attachment} where attachment is optional {url, width?, height?}
  socket.on("message:send", (payload, ack) => {
    const u = socket.data.user;
    if (!u) return;

    // simple rate-limit (1 msg / 500ms)
    const now = Date.now();
    const last = lastMessageAt.get(socket.id) || 0;
    if (now - last < 500) {
      if (ack) ack({ ok: false, error: "Slow down" });
      return;
    }
    lastMessageAt.set(socket.id, now);

    const text = sanitizeText(payload?.text);
    const attachment = payload?.attachment && typeof payload.attachment.url === "string"
      ? { url: payload.attachment.url, width: payload.attachment.width, height: payload.attachment.height }
      : null;

    if (!text && !attachment) {
      if (ack) ack({ ok: false, error: "Empty message" });
      return;
    }

    const msg = {
      id: uuidv4(),
      user: { id: u.id, name: u.name, color: u.color, avatar: u.avatar },
      text,
      attachment,
      createdAt: now,
    };

    io.emit("message:new", msg);
    if (ack) ack({ ok: true, id: msg.id });
  });

  socket.on("settings:update", (partial, ack) => {
    const u = socket.data.user;
    if (!u) return ack && ack({ ok: false });
    if (typeof partial?.name === "string") u.name = sanitizeText(partial.name) || u.name;
    if (typeof partial?.color === "string") u.color = partial.color.slice(0, 32);
    if (typeof partial?.banner === "string") u.banner = partial.banner.slice(0, 32);
    if (typeof partial?.avatar === "string") u.avatar = partial.avatar.slice(0, 512);
    users.set(socket.id, u);
    io.emit("presence:user-updated", { user: u });
    ack && ack({ ok: true, user: u });
  });

  socket.on("disconnect", () => {
    const u = users.get(socket.id);
    users.delete(socket.id);
    if (u) {
      socket.broadcast.emit("presence:user-left", { userId: u.id, name: u.name });
      io.emit("message:new", systemMessage(`${u.name} left`));
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Chat server running on http://localhost:${PORT}`);
});
