// ─────────────────────────────────────────────
// server/routes/payments.js
// 결제 이력 — 사용자가 직접 기록하는 방식 (외부 결제 연동 없음)
// payment.type = 'payment' 행만 다룬다. 정산(settlement)은 공유 구독 단계에서 추가.
//
// POST   /api/payments        결제 기록 추가  { sub_id, due_date?, paid_at?, amount? }
// GET    /api/payments        내 결제 이력    ?year=2026 (생략 시 전체)
// DELETE /api/payments/:id    잘못 기록한 결제 삭제
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";
import { todayKST, isValidDate, isNonNegInt } from "../utils/common.js";

const router = Router();

// ── 결제 기록 추가 ────────────────────────────
router.post("/", async (req, res, next) => {
    const uid = req.user.uid;
    const subId = Number(req.body.sub_id);
    const paidAt = req.body.paid_at ?? todayKST();
    const dueDate = req.body.due_date ?? paidAt; // 어느 회차의 결제인지

    if (!Number.isInteger(subId))
        return res.status(400).json({ error: "sub_id가 필요합니다" });
    if (!isValidDate(paidAt) || !isValidDate(dueDate))
        return res
            .status(400)
            .json({ error: "날짜는 YYYY-MM-DD 형식이어야 합니다" });
    if (paidAt > todayKST())
        return res
            .status(400)
            .json({ error: "미래 날짜는 기록할 수 없습니다" });

    try {
        // 내가 참여 중인 구독인지 확인 (남의 sub_id로 기록하는 것을 차단)
        const [[row]] = await pool.query(
            `SELECT m.share_amount
             FROM subscription_member m
             JOIN subscription s ON s.sub_id = m.sub_id
             WHERE m.sub_id = ? AND m.uid = ? AND m.status = 'joined'`,
            [subId, uid],
        );
        if (!row)
            return res.status(404).json({ error: "구독을 찾을 수 없습니다" });

        // 금액을 생략하면 현재 내 부담액(개인 구독은 구독료 전액).
        // 기록 시점 금액이 저장되므로 이후 구독료가 바뀌어도 이력은 유지됨
        const amount = req.body.amount ?? row.share_amount;
        if (!isNonNegInt(amount))
            return res
                .status(400)
                .json({ error: "amount는 0 이상의 정수여야 합니다" });

        const [result] = await pool.query(
            `INSERT INTO payment (sub_id, uid, type, amount, due_date, paid_at)
             VALUES (?, ?, 'payment', ?, ?, ?)`,
            [subId, uid, Number(amount), dueDate, paidAt],
        );
        res.status(201).json({
            payment_id: result.insertId,
            sub_id: subId,
            type: "payment",
            amount: Number(amount),
            due_date: dueDate,
            paid_at: paidAt,
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY")
            return res
                .status(409)
                .json({ error: "이미 기록된 회차의 결제입니다" });
        next(err);
    }
});

// ── 내 결제 이력 조회 ─────────────────────────
router.get("/", async (req, res, next) => {
    const uid = req.user.uid;
    const params = [uid];
    let yearClause = "";

    if (req.query.year !== undefined) {
        const year = Number(req.query.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100)
            return res.status(400).json({ error: "year가 올바르지 않습니다" });
        yearClause = "AND p.due_date >= ? AND p.due_date < ?";
        params.push(`${year}-01-01`, `${year + 1}-01-01`);
    }

    try {
        const [rows] = await pool.query(
            `SELECT p.payment_id, p.sub_id, s.title, s.category,
                    p.amount, p.due_date, p.paid_at
             FROM payment p
             JOIN subscription s ON s.sub_id = p.sub_id
             WHERE p.uid = ? AND p.type = 'payment' ${yearClause}
             ORDER BY p.due_date DESC, p.payment_id DESC`,
            params,
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ── 결제 기록 삭제 ────────────────────────────
router.delete("/:id", async (req, res, next) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: "잘못된 id입니다" });

    try {
        const [result] = await pool.query(
            `DELETE FROM payment
             WHERE payment_id = ? AND uid = ? AND type = 'payment'`,
            [id, uid],
        );
        if (result.affectedRows === 0)
            return res
                .status(404)
                .json({ error: "결제 기록을 찾을 수 없습니다" });
        res.status(204).send();
    } catch (err) {
        next(err);
    }
});

export default router;
