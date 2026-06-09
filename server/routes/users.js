// ─────────────────────────────────────────────
// server/routes/users.js
//
// POST /api/auth/register   회원가입
// POST /api/auth/login      로그인 → JWT 발급
// GET  /api/users/me        내 프로필 조회
// ─────────────────────────────────────────────
// 설치: npm install bcrypt jsonwebtoken

import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = Router();
const JWT_SECRET  = process.env.JWT_SECRET  ?? "change-me-in-production";
const JWT_EXPIRES = process.env.JWT_EXPIRES ?? "7d";
const SALT_ROUNDS = 10;

// ── 회원가입 ──────────────────────────────────
// POST /api/auth/register
// body: { user_name, email, password }
router.post("/register", async (req, res) => {
  const { user_name, email, password } = req.body;

  if (!user_name || !email || !password)
    return res.status(400).json({ error: "user_name, email, password는 필수입니다" });
  if (user_name.length > 20)
    return res.status(400).json({ error: "user_name은 20자 이하여야 합니다" });

  try {
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await pool.query(
      `INSERT INTO user (user_name, email, password) VALUES (?, ?, ?)`,
      [user_name, email, hashed]
    );
    const uid   = result.insertId;
    const token = jwt.sign({ uid, user_name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.status(201).json({ uid, user_name, email, token });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      // sqlMessage 예시: "Duplicate entry 'jiyeon' for key 'user.uq_user_name'"
      const msg = err.sqlMessage ?? "";
      if (msg.includes("uq_user_name") || msg.includes("user_name"))
        return res.status(409).json({ error: "duplicate_user_name" });
      if (msg.includes("uq_email") || msg.includes("email"))
        return res.status(409).json({ error: "duplicate_email" });
      return res.status(409).json({ error: "duplicate_unknown" });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── 로그인 ────────────────────────────────────
// POST /api/auth/login
// body: { email, password }
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "email, password는 필수입니다" });

  try {
    const [[user]] = await pool.query(
      `SELECT uid, user_name, email, password FROM user WHERE email = ?`,
      [email]
    );
    if (!user)
      return res.status(401).json({ error: "이메일 또는 비밀번호가 틀렸습니다" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ error: "이메일 또는 비밀번호가 틀렸습니다" });

    const token = jwt.sign(
      { uid: user.uid, user_name: user.user_name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    res.json({ uid: user.uid, user_name: user.user_name, email: user.email, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 내 프로필 ─────────────────────────────────
// GET /api/users/me   (인증 필요)
router.get("/me", async (req, res) => {
  try {
    const [[user]] = await pool.query(
      `SELECT uid, user_name, email FROM user WHERE uid = ?`,
      [req.user.uid]
    );
    if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
