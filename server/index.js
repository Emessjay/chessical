import express from "express";
import cookieParser from "cookie-parser";
import { authRouter } from "./auth.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use(cookieParser());
app.use(
  (req, res, next) => {
    const origin = req.get("origin");
    if (origin) {
      res.set("Access-Control-Allow-Origin", origin);
    }
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  }
);
app.use("/api", authRouter);

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT}`);
});
