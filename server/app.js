// ─────────────────────────────────────────────
// server/app.js  —  Express 앱 진입점
// ─────────────────────────────────────────────
// 설치:
//   npm install express cors dotenv mysql2 bcrypt jsonwebtoken
//
// 실행:
//   node --env-file=.env app.js   (Node 20+)
//   또는 .env를 루트에 두고:
//   node app.js
// ─────────────────────────────────────────────

import express from "express";
import cors    from "cors";
import jwt     from "jsonwebtoken";
import "dotenv/config";

import subscriptionsRouter from "./routes/subscriptions.js";
import friendsRouter       from "./routes/friends.js";
import usersRouter         from "./routes/users.js";

const app  = express();
const PORT = process.env.PORT ?? 4000;
const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";

// ── 미들웨어 ──────────────────────────────────
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // 서버 직접 호출(origin 없음) 또는 허용 목록에 있으면 통과
    if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
    else cb(new Error(`CORS: ${origin} 허용되지 않음`));
  },
  credentials: true,
}));
app.use(express.json());

// ── JWT 인증 미들웨어 ─────────────────────────
// Authorization: Bearer <token>
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "인증이 필요합니다" });

  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "유효하지 않은 토큰입니다" });
  }
}

// ── 라우터 ────────────────────────────────────
// 인증 불필요
app.use("/api/auth", usersRouter);

// 인증 필요
app.use("/api/users",         authenticate, usersRouter);
app.use("/api/subscriptions", authenticate, subscriptionsRouter);
app.use("/api/friends",       authenticate, friendsRouter);

// ── 헬스체크 ──────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok" }));

// ── 에러 핸들러 ───────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다" });
});

app.listen(PORT, () => console.log(`MyTracker API  →  http://localhost:${PORT}`));
