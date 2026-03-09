import { Router } from "express";
import bcrypt from "bcryptjs";
import {
  findUserByUsername,
  findUserById,
  createUser,
  createSession,
  getSession,
  deleteSession,
} from "./db.js";

export const authRouter = Router();

const SESSION_COOKIE = "sid";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

function sessionMiddleware(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  const session = getSession(sessionId);
  if (session) {
    req.userId = session.userId;
  }
  next();
}

authRouter.use(sessionMiddleware);

authRouter.get("/me", (req, res) => {
  if (!req.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = findUserById(req.userId);
  if (!user) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({ id: user.id, username: user.username });
});

authRouter.post("/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  const u = (username ?? "").trim();
  const p = typeof password === "string" ? password : "";
  if (!u || u.length < 2 || u.length > 32) {
    return res.status(400).json({ error: "Username must be 2–32 characters" });
  }
  if (!p || p.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  if (findUserByUsername(u)) {
    return res.status(409).json({ error: "Username already taken" });
  }
  const passwordHash = await bcrypt.hash(p, 10);
  const user = createUser(u, passwordHash);
  const sessionId = createSession(user.id);
  res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTS);
  res.status(201).json({ id: user.id, username: user.username });
});

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  const u = (username ?? "").trim();
  const p = typeof password === "string" ? password : "";
  if (!u || !p) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const user = findUserByUsername(u);
  if (!user || !(await bcrypt.compare(p, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const sessionId = createSession(user.id);
  res.cookie(SESSION_COOKIE, sessionId, COOKIE_OPTS);
  res.json({ id: user.id, username: user.username });
});

authRouter.post("/logout", (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  deleteSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.status(204).end();
});
