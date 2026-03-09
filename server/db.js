import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data.json");

function load() {
  if (!existsSync(DATA_PATH)) {
    return { users: [], nextUserId: 1 };
  }
  return JSON.parse(readFileSync(DATA_PATH, "utf-8"));
}

function save(data) {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}

export function findUserByUsername(username) {
  const data = load();
  return data.users.find(
    (u) => u.username.toLowerCase() === username.toLowerCase()
  );
}

export function findUserById(id) {
  const data = load();
  return data.users.find((u) => u.id === id);
}

export function createUser(username, passwordHash) {
  const data = load();
  const id = String(data.nextUserId++);
  const user = { id, username, passwordHash };
  data.users.push(user);
  save(data);
  return user;
}

// In-memory session store: sessionId -> { userId, createdAt }
const sessions = new Map();

export function createSession(userId) {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { userId, createdAt: Date.now() });
  return sessionId;
}

export function getSession(sessionId) {
  return sessionId ? sessions.get(sessionId) : null;
}

export function deleteSession(sessionId) {
  if (sessionId) sessions.delete(sessionId);
}
