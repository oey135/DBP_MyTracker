// ─────────────────────────────────────────────
// server/routes/friends.js
//
// GET    /api/friends                 내 친구 목록 (상태 포함)
// GET    /api/friends/search?email=   이메일로 사용자 검색
// POST   /api/friends                 친구 요청 보내기
// PUT    /api/friends/:senderUid      요청 수락 / 거절 (거절은 status = rejected)
// DELETE /api/friends/:targetUid      보낸 요청 취소 / 친구 삭제
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
            WHERE (f.sender = ? OR f.receiver = ?)
              AND f.status <> 'rejected'
              AND u.deleted_at IS NULL
            ORDER BY f.status, u.user_name`,
            [uid, uid, uid, uid],
        );
        // MySQL의 BIT(1) bool을 JS boolean으로 변환
        res.json(rows.map((r) => ({ ...r, isSender: r.isSender === 1 })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 사용자 검색 (이메일) ───────────────────────
// GET /api/friends/search?email=...
// 개인정보 보호를 위해 이메일이 정확히 일치하는 사용자만 반환
// 반환: { uid, user_name, relation: none | pending_sent | pending_received | accepted }
router.get("/search", async (req, res, next) => {
    const myUid = req.user.uid;
    const email = String(req.query.email ?? "").trim();
    if (!email) return res.status(400).json({ error: "email을 입력하세요" });

    try {
        const [[u]] = await pool.query(
            `SELECT uid, user_name FROM user WHERE email = ? AND deleted_at IS NULL`,
            [email],
        );
        if (!u) return res.status(404).json({ error: "해당 이메일의 사용자가 없습니다" });
        if (u.uid === myUid)
            return res.json({ ...u, relation: "self" });

        const [[f]] = await pool.query(
            `SELECT sender, status FROM friends
             WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)`,
            [myUid, u.uid, u.uid, myUid],
        );
        let relation = "none";
        if (f?.status === "accepted") relation = "accepted";
        else if (f?.status === "pending")
            relation = f.sender === myUid ? "pending_sent" : "pending_received";
        res.json({ ...u, relation });
    } catch (err) {
        next(err);
    }
});

// ── 친구 요청 보내기 ──────────────────────────
// POST /api/friends
// body: { email } 또는 { user_name }
router.post("/", async (req, res) => {
    const senderUid = req.user.uid;
    const email = req.body.email?.trim();
    const user_name = req.body.user_name?.trim();

    if (!email && !user_name)
        return res.status(400).json({ error: "email 또는 user_name이 필요합니다" });

    try {
        // 상대방 uid 조회
        const [[target]] = await pool.query(
            email
                ? `SELECT uid FROM user WHERE email = ? AND deleted_at IS NULL`
                : `SELECT uid FROM user WHERE user_name = ? AND deleted_at IS NULL`,
            [email ?? user_name],
        );
        if (!target)
            return res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
        if (target.uid === senderUid)
            return res
                .status(400)
                .json({ error: "자기 자신에게 요청할 수 없습니다" });

        // 이미 요청/관계가 있는지 확인 (역방향 포함)
        const [[exists]] = await pool.query(
            `SELECT status FROM friends
       WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)`,
            [senderUid, target.uid, target.uid, senderUid],
        );
        if (exists && exists.status !== "rejected")
            return res.status(409).json({ error: "이미 요청이 존재합니다" });

        if (exists) {
            // 거절된 요청은 기록을 재사용해 새 요청으로 바꾼다 (uq_friends_pair)
            await pool.query(
                `UPDATE friends SET sender = ?, receiver = ?, status = 'pending'
         WHERE (sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?)`,
                [senderUid, target.uid, senderUid, target.uid, target.uid, senderUid],
            );
        } else {
            await pool.query(
                `INSERT INTO friends (sender, receiver, status) VALUES (?, ?, 'pending')`,
                [senderUid, target.uid],
            );
        }
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
            // reject → 행은 남기고 상태만 rejected (요청 이력 보존)
            const [result] = await pool.query(
                `UPDATE friends SET status = 'rejected'
         WHERE sender = ? AND receiver = ? AND status = 'pending'`,
                [senderUid, receiverUid],
            );
            if (result.affectedRows === 0)
                return res
                    .status(404)
                    .json({ error: "요청을 찾을 수 없습니다" });
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
       WHERE ((sender = ? AND receiver = ?)
          OR (sender = ? AND receiver = ?))
         AND status <> 'rejected'`,
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
