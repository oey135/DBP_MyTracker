// ─────────────────────────────────────────────
// server/routes/subscriptions.js
//
// GET    /api/subscriptions           내 구독 목록
// POST   /api/subscriptions           구독 추가
// PUT    /api/subscriptions/:title    구독 수정 (상태 변경·복구 포함)
// DELETE /api/subscriptions/:title    구독 삭제
//
// GET    /api/subscriptions/friend/:uid   친구 구독 목록 (subscribed만)
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ── 내 구독 목록 ──────────────────────────────
// GET /api/subscriptions
router.get("/", async (req, res) => {
  const uid = req.user.uid;
  try {
    const [rows] = await pool.query(
      `SELECT uid, title, price,
              start_date, billing_date, memo, status
       FROM subscription
       WHERE uid = ?
       ORDER BY status = 'cancelled', title`,
      [uid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 구독 추가 ─────────────────────────────────
// POST /api/subscriptions
// body: { title, price, start_date?, billing_date, memo?, status? }
router.post("/", async (req, res) => {
  const uid = req.user.uid;
  const { title, price, start_date = null, billing_date, memo = "", status = "subscribed" } = req.body;

  if (!title || price == null || !billing_date)
    return res.status(400).json({ error: "title, price, billing_date는 필수입니다" });
  if (price < 0)
    return res.status(400).json({ error: "price는 0 이상이어야 합니다" });

  try {
    await pool.query(
      `INSERT INTO subscription (uid, title, price, start_date, billing_date, memo, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uid, title, price, start_date, billing_date, memo, status]
    );
    res.status(201).json({ uid, title, price, start_date, billing_date, memo, status });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "이미 등록된 서비스입니다" });
    res.status(500).json({ error: err.message });
  }
});

// ── 구독 수정 (상태 변경·복구 포함) ───────────
// PUT /api/subscriptions/:title
// body: 변경할 필드만 전달 (partial update)
router.put("/:title", async (req, res) => {
  const uid   = req.user.uid;
  const title = decodeURIComponent(req.params.title);
  const allowed = ["price", "start_date", "billing_date", "memo", "status"];
  const fields  = Object.keys(req.body).filter(k => allowed.includes(k));

  if (fields.length === 0)
    return res.status(400).json({ error: "변경할 필드가 없습니다" });

  // 복구(status: subscribed)일 때 start_date가 없으면 오늘로 자동 설정
  if (req.body.status === "subscribed" && !req.body.start_date) {
    req.body.start_date = new Date().toISOString().slice(0, 10);
    if (!fields.includes("start_date")) fields.push("start_date");
  }

  const setClause = fields.map(f => `${f} = ?`).join(", ");
  const values    = [...fields.map(f => req.body[f]), uid, title];

  try {
    const [result] = await pool.query(
      `UPDATE subscription SET ${setClause} WHERE uid = ? AND title = ?`,
      values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "구독을 찾을 수 없습니다" });

    const [[updated]] = await pool.query(
      `SELECT * FROM subscription WHERE uid = ? AND title = ?`,
      [uid, title]
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 구독 삭제 ─────────────────────────────────
// DELETE /api/subscriptions/:title
router.delete("/:title", async (req, res) => {
  const uid   = req.user.uid;
  const title = decodeURIComponent(req.params.title);
  try {
    const [result] = await pool.query(
      `DELETE FROM subscription WHERE uid = ? AND title = ?`,
      [uid, title]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "구독을 찾을 수 없습니다" });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 친구 구독 목록 (subscribed만) ─────────────
// GET /api/subscriptions/friend/:uid
router.get("/friend/:uid", async (req, res) => {
  const myUid     = req.user.uid;
  const friendUid = Number(req.params.uid);

  // 친구 관계 확인 (accepted인 경우만 허용)
  try {
    const [[rel]] = await pool.query(
      `SELECT 1 FROM friends
       WHERE status = 'accepted'
         AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))`,
      [myUid, friendUid, friendUid, myUid]
    );
    if (!rel)
      return res.status(403).json({ error: "친구 관계가 아닙니다" });

    const [rows] = await pool.query(
      `SELECT title, price, billing_date, memo
       FROM subscription
       WHERE uid = ? AND status = 'subscribed'
       ORDER BY title`,
      [friendUid]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
