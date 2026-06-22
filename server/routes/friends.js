// ─────────────────────────────────────────────
// server/routes/friends.js
//
// GET    /api/friends                 내 친구 목록 (상태 포함)
// POST   /api/friends                 친구 요청 보내기
// PUT    /api/friends/:senderUid      요청 수락 / 거절
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";

const router = Router();

// ── 내 친구 목록 ──────────────────────────────
// GET /api/friends
// 반환: [{ uid, user_name, status, isSender }, ...]
router.get("/", async (req, res) => {
    const uid = req.user.uid;
    try {
        const [rows] = await pool.query(
            `SELECT
            u.uid,
            u.user_name,
            f.status,
            (f.sender = ?) AS isSender
            FROM friends f
            JOIN user u ON u.uid = IF(f.sender = ?, f.receiver, f.sender)
            WHERE f.sender = ? OR f.receiver = ?
            ORDER BY f.status, u.user_name`,
            [uid, uid, uid, uid],
        );
        // MySQL의 BIT(1) bool을 JS boolean으로 변환
        res.json(rows.map((r) => ({ ...r, isSender: r.isSender === 1 })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 친구 요청 보내기 ──────────────────────────
// POST /api/friends
// body: { user_name }  ← 상대방 username
router.post("/", async (req, res) => {
    const senderUid = req.user.uid;
    const { user_name } = req.body;

    if (!user_name)
        return res.status(400).json({ error: "user_name은 필수입니다" });

    try {
        // 상대방 uid 조회
        const [[target]] = await pool.query(
            `SELECT uid FROM user WHERE user_name = ?`,
            [user_name],
        );
        if (!target)
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
        if (target.uid === senderUid)
            return res
                .status(400)
                .json({ error: "자기 자신에게 요청할 수 없습니다" });

        // 이미 요청/관계가 있는지 확인
        const [[exists]] = await pool.query(
            `SELECT 1 FROM friends
       WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)`,
            [senderUid, target.uid, target.uid, senderUid],
        );
        if (exists)
            return res.status(409).json({ error: "이미 요청이 존재합니다" });

        await pool.query(
            `INSERT INTO friends (sender, receiver, status) VALUES (?, ?, 'pending')`,
            [senderUid, target.uid],
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 친구 요청 수락 / 거절 ─────────────────────
// PUT /api/friends/:senderUid
// body: { action: "accept" | "reject" }
router.put("/:senderUid", async (req, res) => {
    const receiverUid = req.user.uid;
    const senderUid = Number(req.params.senderUid);
    const { action } = req.body;

    if (!["accept", "reject"].includes(action))
        return res
            .status(400)
            .json({ error: "action은 accept 또는 reject여야 합니다" });

    try {
        if (action === "accept") {
            const [result] = await pool.query(
                `UPDATE friends SET status = 'accepted'
         WHERE sender = ? AND receiver = ? AND status = 'pending'`,
                [senderUid, receiverUid],
            );
            if (result.affectedRows === 0)
                return res
                    .status(404)
                    .json({ error: "요청을 찾을 수 없습니다" });
        } else {
            // reject → 행 삭제
            await pool.query(
                `DELETE FROM friends WHERE sender = ? AND receiver = ?`,
                [senderUid, receiverUid],
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 보낸 요청 취소 ───────────────────────────
// DELETE /api/friends/:targetUid
// pending → 보낸 요청 취소 / accepted → 친구 삭제 (양방향 모두 삭제)
router.delete("/:targetUid", async (req, res) => {
    const myUid = req.user.uid;
    const targetUid = Number(req.params.targetUid);
    try {
        const [result] = await pool.query(
            `DELETE FROM friends
       WHERE (sender = ? AND receiver = ?)
          OR (sender = ? AND receiver = ?)`,
            [myUid, targetUid, targetUid, myUid],
        );
        if (result.affectedRows === 0)
            return res
                .status(404)
                .json({ error: "친구 관계를 찾을 수 없습니다" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
