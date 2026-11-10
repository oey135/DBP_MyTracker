// ─────────────────────────────────────────────
// server/routes/payments.js
// 결제 이력 — 사용자가 직접 기록하는 방식 (외부 결제 연동 없음)
//
// POST   /api/payments        결제 기록 추가  { sub_id, pay_date?, amount? }
// GET    /api/payments        내 결제 이력    ?year=2026 (생략 시 전체)
// DELETE /api/payments/:id    잘못 기록한 결제 삭제
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";

const router = Router();

// 한국 시간 기준 오늘 날짜 (서버가 UTC여도 날짜가 어긋나지 않도록)
const todayKST = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// "YYYY-MM-DD" 형식이면서 실제로 존재하는 날짜인지
function isValidDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// ── 결제 기록 추가 ────────────────────────────
router.post("/", async (req, res) => {
    const uid = req.user.uid;
    const subId = Number(req.body.sub_id);
    const payDate = req.body.pay_date ?? todayKST();

    if (!Number.isInteger(subId))
        return res.status(400).json({ error: "sub_id가 필요합니다" });
    if (!isValidDate(payDate))
        return res
            .status(400)
            .json({ error: "pay_date는 YYYY-MM-DD 형식이어야 합니다" });
    if (payDate > todayKST())
        return res
            .status(400)
            .json({ error: "미래 날짜는 기록할 수 없습니다" });

    try {
        // 내 구독인지 확인 (남의 sub_id로 기록하는 것을 차단)
        const [[sub]] = await pool.query(
            `SELECT price FROM subscription WHERE sub_id = ? AND uid = ?`,
            [subId, uid],
        );
        if (!sub)
            return res.status(404).json({ error: "구독을 찾을 수 없습니다" });

        // 금액을 생략하면 현재 구독 금액. 이후 구독료가 바뀌어도 이 값은 유지됨
        const amount = req.body.amount ?? sub.price;
        if (!Number.isInteger(Number(amount)) || Number(amount) < 0)
            return res
                .status(400)
                .json({ error: "amount는 0 이상의 정수여야 합니다" });

        const [result] = await pool.query(
            `INSERT INTO payment (sub_id, uid, pay_date, amount)
             VALUES (?, ?, ?, ?)`,
            [subId, uid, payDate, Number(amount)],
        );
        res.status(201).json({
            payment_id: result.insertId,
            sub_id: subId,
            pay_date: payDate,
            amount: Number(amount),
        });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY")
            return res
                .status(409)
                .json({ error: "해당 날짜에 이미 기록된 결제입니다" });
        res.status(500).json({ error: err.message });
    }
});

// ── 내 결제 이력 조회 ─────────────────────────
router.get("/", async (req, res) => {
    const uid = req.user.uid;
    const params = [uid];
    let yearClause = "";

    if (req.query.year !== undefined) {
        const year = Number(req.query.year);
        if (!Number.isInteger(year) || year < 2000 || year > 2100)
            return res.status(400).json({ error: "year가 올바르지 않습니다" });
        yearClause = "AND p.pay_date >= ? AND p.pay_date < ?";
        params.push(`${year}-01-01`, `${year + 1}-01-01`);
    }

    try {
        const [rows] = await pool.query(
            `SELECT p.payment_id, p.sub_id, s.title, p.pay_date, p.amount
             FROM payment p
             JOIN subscription s ON s.sub_id = p.sub_id
             WHERE p.uid = ? ${yearClause}
             ORDER BY p.pay_date DESC, p.payment_id DESC`,
            params,
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 결제 기록 삭제 ────────────────────────────
router.delete("/:id", async (req, res) => {
    const uid = req.user.uid;
    const id = Number(req.params.id);
    if (!Number.isInteger(id))
        return res.status(400).json({ error: "잘못된 id입니다" });

    try {
        const [result] = await pool.query(
            `DELETE FROM payment WHERE payment_id = ? AND uid = ?`,
            [id, uid],
        );
        if (result.affectedRows === 0)
            return res
                .status(404)
                .json({ error: "결제 기록을 찾을 수 없습니다" });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
