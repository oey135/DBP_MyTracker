// ─────────────────────────────────────────────
// server/routes/stats.js  —  지출 분석 (기획서 2. 구독 지출 분석)
//
// 두 가지 기준을 함께 제공한다.
//   예정(scheduled) : 구독 정보(결제 주기·결제일·기간)로 계산한 결제 예정 금액
//   실제(paid)      : payment.type = 'payment' 결제 기록 합계
// 금액은 모두 "내 부담액" = subscription_member.share_amount 기준
// (개인 구독은 구독료 전액, 공유 구독은 내 몫)
//
// GET /api/stats/overview?ym=YYYY-MM     이번 달·지난달 비교, 월/연 예상, 주기별 비교
// GET /api/stats/monthly?year=YYYY       월별 예정·실제 추이 (12개월)
// GET /api/stats/breakdown?year=YYYY     서비스별·카테고리별 지출 (예정·실제)
// GET /api/stats/forecast?months=N       이번 달부터 N개월 예상 지출 (결제일 포함)
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";
import { todayKST } from "../utils/common.js";

const router = Router();

const ymRe = /^(\d{4})-(\d{2})$/;
const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM" + n개월 → "YYYY-MM"
function addMonths(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function parseYm(v) {
    if (v === undefined) return todayKST().slice(0, 7);
    const m = ymRe.exec(v);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
    return v;
}

function parseYear(v) {
    if (v === undefined) return Number(todayKST().slice(0, 4));
    const y = Number(v);
    return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : null;
}

// ── 결제 예정 일정 (재귀 CTE로 월 목록을 만들고 구독과 조인) ──
// fromYm ~ toYm 사이 각 달에 결제가 예정된 구독과 그 결제일·금액
//   월간 구독 : 매달
//   연간 구독 : billing_date의 월과 같은 달만
//   기간      : start_date가 그 달 말일 이전, end_date가 그 달 1일 이후
//   결제일    : 그 달에 없는 날짜(31일 등)는 말일로 보정
async function scheduleRows(uid, fromYm, toYm) {
    const [rows] = await pool.query(
        `WITH RECURSIVE months AS (
             SELECT CAST(CONCAT(?, '-01') AS DATE) AS m_start
             UNION ALL
             SELECT m_start + INTERVAL 1 MONTH FROM months
             WHERE m_start < CAST(CONCAT(?, '-01') AS DATE)
         )
         SELECT DATE_FORMAT(mo.m_start, '%Y-%m') AS ym,
                s.sub_id, s.title, s.category, s.billing_cycle, s.status,
                m.share_amount AS amount,
                DATE_FORMAT(
                    mo.m_start + INTERVAL
                        (LEAST(DAY(s.billing_date), DAY(LAST_DAY(mo.m_start))) - 1) DAY,
                    '%Y-%m-%d') AS due_date
         FROM months mo
         JOIN subscription s
           ON s.billing_date IS NOT NULL
          AND s.start_date IS NOT NULL
          AND s.start_date <= LAST_DAY(mo.m_start)
          AND (s.end_date IS NULL OR s.end_date >= mo.m_start)
          AND (s.billing_cycle = 'monthly' OR MONTH(s.billing_date) = MONTH(mo.m_start))
         JOIN subscription_member m
           ON m.sub_id = s.sub_id AND m.uid = ? AND m.status = 'joined'
         ORDER BY due_date, s.title`,
        [fromYm, toYm, uid],
    );
    return rows;
}

// 기간 내 실제 결제 합계 (월별)
async function paidByMonth(uid, fromYm, toYm) {
    const [rows] = await pool.query(
        `SELECT DATE_FORMAT(due_date, '%Y-%m') AS ym,
                SUM(amount) AS total, COUNT(*) AS cnt
         FROM payment
         WHERE uid = ? AND type = 'payment'
           AND due_date >= CAST(CONCAT(?, '-01') AS DATE)
           AND due_date <  CAST(CONCAT(?, '-01') AS DATE) + INTERVAL 1 MONTH
         GROUP BY ym`,
        [uid, fromYm, toYm],
    );
    return Object.fromEntries(
        rows.map((r) => [r.ym, { total: Number(r.total), count: r.cnt }]),
    );
}

const sumBy = (rows, key) => {
    const out = {};
    for (const r of rows) out[r[key]] = (out[r[key]] ?? 0) + Number(r.amount);
    return out;
};

// ── 개요 ──────────────────────────────────────
router.get("/overview", async (req, res, next) => {
    const uid = req.user.uid;
    const ym = parseYm(req.query.ym);
    if (!ym) return res.status(400).json({ error: "ym은 YYYY-MM 형식이어야 합니다" });
    const prevYm = addMonths(ym, -1);

    try {
        const sched = await scheduleRows(uid, prevYm, ym);
        const schedByMonth = sumBy(sched, "ym");
        const paid = await paidByMonth(uid, prevYm, ym);

        // 현재 구독 중인 것 기준 월평균·연간 예상, 결제 주기별 비교
        const [cycles] = await pool.query(
            `SELECT s.billing_cycle,
                    COUNT(*)              AS cnt,
                    SUM(m.share_amount)   AS total,   -- 결제 1회 금액 합
                    ROUND(SUM(CASE WHEN s.billing_cycle = 'yearly'
                                   THEN m.share_amount / 12
                                   ELSE m.share_amount END)) AS monthly_avg,
                    SUM(CASE WHEN s.billing_cycle = 'yearly'
                             THEN m.share_amount
                             ELSE m.share_amount * 12 END)   AS annual
             FROM subscription s
             JOIN subscription_member m
               ON m.sub_id = s.sub_id AND m.uid = ? AND m.status = 'joined'
             WHERE s.status = 'subscribed'
             GROUP BY s.billing_cycle`,
            [uid],
        );
        const byCycle = { monthly: null, yearly: null };
        for (const c of cycles)
            byCycle[c.billing_cycle] = {
                count: c.cnt,
                total: Number(c.total),
                monthlyAvg: Number(c.monthly_avg),
                annual: Number(c.annual),
            };
        const expectedMonthly =
            (byCycle.monthly?.monthlyAvg ?? 0) + (byCycle.yearly?.monthlyAvg ?? 0);
        const expectedAnnual =
            (byCycle.monthly?.annual ?? 0) + (byCycle.yearly?.annual ?? 0);

        const month = (k) => ({
            ym: k,
            scheduled: schedByMonth[k] ?? 0,
            paid: paid[k]?.total ?? 0,
            paidCount: paid[k]?.count ?? 0,
        });

        res.json({
            thisMonth: month(ym),
            lastMonth: month(prevYm),
            expected: { monthly: expectedMonthly, annual: expectedAnnual },
            byCycle,
        });
    } catch (err) {
        next(err);
    }
});

// ── 월별 추이 ─────────────────────────────────
router.get("/monthly", async (req, res, next) => {
    const uid = req.user.uid;
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: "year가 올바르지 않습니다" });

    try {
        const from = `${year}-01`,
            to = `${year}-12`;
        const sched = sumBy(await scheduleRows(uid, from, to), "ym");
        const paid = await paidByMonth(uid, from, to);
        const months = Array.from({ length: 12 }, (_, i) => {
            const k = `${year}-${pad(i + 1)}`;
            return {
                ym: k,
                month: i + 1,
                scheduled: sched[k] ?? 0,
                paid: paid[k]?.total ?? 0,
            };
        });
        res.json({
            year,
            months,
            totalScheduled: months.reduce((a, m) => a + m.scheduled, 0),
            totalPaid: months.reduce((a, m) => a + m.paid, 0),
        });
    } catch (err) {
        next(err);
    }
});

// ── 서비스별·카테고리별 ───────────────────────
//   expected : 현재 구독 중인 서비스의 월 환산 금액 (연간은 /12)
//   paid     : 해당 연도 결제 기록 합계
router.get("/breakdown", async (req, res, next) => {
    const uid = req.user.uid;
    const year = parseYear(req.query.year);
    if (!year) return res.status(400).json({ error: "year가 올바르지 않습니다" });

    try {
        const [expService] = await pool.query(
            `SELECT s.sub_id, s.title, s.category, s.billing_cycle,
                    m.share_amount AS amount,
                    ROUND(CASE WHEN s.billing_cycle = 'yearly'
                               THEN m.share_amount / 12
                               ELSE m.share_amount END) AS monthly
             FROM subscription s
             JOIN subscription_member m
               ON m.sub_id = s.sub_id AND m.uid = ? AND m.status = 'joined'
             WHERE s.status = 'subscribed'
             ORDER BY monthly DESC, s.title`,
            [uid],
        );
        const [expCategory] = await pool.query(
            `SELECT s.category,
                    COUNT(*) AS cnt,
                    ROUND(SUM(CASE WHEN s.billing_cycle = 'yearly'
                                   THEN m.share_amount / 12
                                   ELSE m.share_amount END)) AS monthly
             FROM subscription s
             JOIN subscription_member m
               ON m.sub_id = s.sub_id AND m.uid = ? AND m.status = 'joined'
             WHERE s.status = 'subscribed'
             GROUP BY s.category
             ORDER BY monthly DESC`,
            [uid],
        );
        const range = [`${year}-01-01`, `${year + 1}-01-01`];
        const [paidService] = await pool.query(
            `SELECT p.sub_id, s.title, s.category,
                    SUM(p.amount) AS total, COUNT(*) AS cnt
             FROM payment p
             JOIN subscription s ON s.sub_id = p.sub_id
             WHERE p.uid = ? AND p.type = 'payment'
               AND p.due_date >= ? AND p.due_date < ?
             GROUP BY p.sub_id, s.title, s.category
             ORDER BY total DESC`,
            [uid, ...range],
        );
        const [paidCategory] = await pool.query(
            `SELECT s.category, SUM(p.amount) AS total, COUNT(*) AS cnt
             FROM payment p
             JOIN subscription s ON s.sub_id = p.sub_id
             WHERE p.uid = ? AND p.type = 'payment'
               AND p.due_date >= ? AND p.due_date < ?
             GROUP BY s.category
             ORDER BY total DESC`,
            [uid, ...range],
        );

        const withShare = (rows, key) => {
            const total = rows.reduce((a, r) => a + Number(r[key]), 0);
            return {
                total,
                items: rows.map((r) => ({
                    ...r,
                    [key]: Number(r[key]),
                    share: total ? Number(r[key]) / total : 0,
                })),
            };
        };

        res.json({
            year,
            expected: {
                byService: withShare(expService, "monthly"),
                byCategory: withShare(expCategory, "monthly"),
            },
            paid: {
                byService: withShare(paidService, "total"),
                byCategory: withShare(paidCategory, "total"),
            },
        });
    } catch (err) {
        next(err);
    }
});

// ── 향후 예상 지출 ────────────────────────────
router.get("/forecast", async (req, res, next) => {
    const uid = req.user.uid;
    const months = req.query.months === undefined ? 6 : Number(req.query.months);
    if (!Number.isInteger(months) || months < 1 || months > 24)
        return res.status(400).json({ error: "months는 1~24 사이여야 합니다" });

    try {
        const fromYm = todayKST().slice(0, 7);
        const toYm = addMonths(fromYm, months - 1);
        // 해지한 구독은 end_date 이후 달에는 자동으로 빠진다
        const rows = await scheduleRows(uid, fromYm, toYm);
        const out = [];
        for (let i = 0; i < months; i++) {
            const ym = addMonths(fromYm, i);
            const items = rows
                .filter((r) => r.ym === ym)
                .map((r) => ({ ...r, amount: Number(r.amount) }));
            out.push({
                ym,
                total: items.reduce((a, r) => a + r.amount, 0),
                items,
            });
        }
        res.json({
            months: out,
            total: out.reduce((a, m) => a + m.total, 0),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
