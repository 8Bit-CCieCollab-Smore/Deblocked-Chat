import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const MAX_MESSAGES = 150;
let messages = { global: [] };
let users = new Set();

// Load from file (optional)
const dataFile = path.join(__dirname, "messages.json");
if (fs.existsSync(dataFile)) {
  messages = JSON.parse(fs.readFileSync(dataFile));
}

// Get messages for room
app.get("/api/messages/:room", (req, res) => {
  const { room } = req.params;
  res.json(messages[room] || []);
});

// Post new message
app.post("/api/messages/:room", (req, res) => {
  const { room } = req.params;
  const { user, text } = req.body;
  if (!messages[room]) messages[room] = [];
  const msg = { user, text, timestamp: Date.now() };
  messages[room].push(msg);
  if (messages[room].length > MAX_MESSAGES) {
    messages[room].shift();
  }
  fs.writeFileSync(dataFile, JSON.stringify(messages, null, 2));
  users.add(user);
  res.json({ status: "ok" });
});

// Check if user exists
app.get("/api/checkUser/:name", (req, res) => {
  const { name } = req.params;
  if (users.has(name)) {
    res.json({ exists: true });
  } else {
    res.status(404).json({ exists: false });
  }
});

app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
