// ─────────────────────────────────────────────
// server/routes/alerts.js  —  알림 모아보기 (기획서 1. 결제 알림 / 4단계 알림 자동화)
//
// GET /api/alerts
//   upcoming    : 알림 설정(notify_days_before) 범위에 들어온 결제 예정 (아직 결제 기록 없음)
//   invites     : 받은 공유 구독 초대 수
//   settlements : 이번 달 결제일이 지났는데 정산되지 않은 몫
//                 owner  → 받아야 할 정산 / member → 보내야 할 정산
//   friendRequests : 받은 친구 요청 수
// 로그인하거나 홈 화면을 열 때마다 서버가 다시 계산하므로 별도 저장 없이 자동으로 갱신된다.
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";
import { todayKST } from "../utils/common.js";
import { scheduleRows, addMonths } from "./stats.js";

const router = Router();

const daysBetween = (from, to) =>
    Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

router.get("/", async (req, res, next) => {
    const uid = req.user.uid;
    const today = todayKST();
    const ym = today.slice(0, 7);

    try {
        // 이번 달 ~ 다음 달 결제 일정 (알림은 최대 30일 전이므로 두 달이면 충분)
        const rows = await scheduleRows(uid, ym, addMonths(ym, 1));

        const [paidRows] = await pool.query(
            `SELECT sub_id, due_date FROM payment
             WHERE uid = ? AND type = 'payment' AND due_date >= ?`,
            [uid, `${ym}-01`],
        );
        const paid = new Set(paidRows.map((p) => `${p.sub_id}|${p.due_date}`));

        const upcoming = rows
            .filter((r) => r.status === "subscribed" && r.notify_days_before != null)
            .map((r) => ({ ...r, days_left: daysBetween(today, r.due_date) }))
            .filter(
                (r) =>
                    r.days_left >= 0 &&
                    r.days_left <= r.notify_days_before &&
                    !paid.has(`${r.sub_id}|${r.due_date}`),
            )
            .map(({ sub_id, title, amount, due_date, days_left, billing_cycle }) => ({
                sub_id, title, amount: Number(amount), due_date, days_left, billing_cycle,
            }));

        // 이번 달 이미 지난 회차의 정산 상태
        const settlements = [];
        for (const r of rows.filter((r) => r.ym === ym && r.due_date <= today)) {
            const isOwner = r.owner_uid === uid;
            const [items] = await pool.query(
                `SELECT m.uid, u.user_name, COALESCE(p.amount, m.share_amount) AS amount
                 FROM subscription_member m
                 JOIN user u ON u.uid = m.uid
                 LEFT JOIN payment p
                   ON p.sub_id = m.sub_id AND p.uid = m.uid
                  AND p.type = 'settlement' AND p.due_date = ?
                 WHERE m.sub_id = ? AND m.role = 'member' AND m.status = 'joined'
                   AND p.paid_at IS NULL
                   ${isOwner ? "" : "AND m.uid = ?"}`,
                isOwner ? [r.due_date, r.sub_id] : [r.due_date, r.sub_id, uid],
            );
            for (const it of items)
                settlements.push({
                    sub_id: r.sub_id,
                    title: r.title,
                    due_date: r.due_date,
                    direction: isOwner ? "receive" : "send",
                    user_name: it.user_name,
                    amount: Number(it.amount),
                });
        }

        const [[{ invites }]] = await pool.query(
            `SELECT COUNT(*) AS invites
             FROM subscription_member m JOIN subscription s ON s.sub_id = m.sub_id
             WHERE m.uid = ? AND m.status = 'invited' AND s.status = 'subscribed'`,
            [uid],
        );
        const [[{ friendRequests }]] = await pool.query(
            `SELECT COUNT(*) AS friendRequests FROM friends
             WHERE receiver = ? AND status = 'pending'`,
            [uid],
        );

        res.json({ upcoming, settlements, invites, friendRequests });
    } catch (err) {
        next(err);
    }
});

export default router;
