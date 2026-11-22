// ─────────────────────────────────────────────
// server/routes/shared.js  —  공유 구독 (기획서 4. 공유 구독 관리)
//
// 공유 그룹 = 공유 구독 1건. 참여자는 subscription_member, 정산은 payment(type='settlement')
//
// GET    /api/shared/invites                  나에게 온 공유 초대 목록
// POST   /api/shared/:subId/respond           초대 수락/거절  { action: accept|reject }
// GET    /api/shared/:subId                   공유 구독 상세 (참여자·분담액)
// POST   /api/shared/:subId/members           친구 초대 (owner)  { uid }
// DELETE /api/shared/:subId/members/:uid      참여자 내보내기 (owner) / 나가기 (본인)
// PUT    /api/shared/:subId/split             분담 방식 변경 (owner)
//                                             { split_type, shares?: [{ uid, amount }] }
// GET    /api/shared/:subId/settlements?ym=   해당 월 회차의 참여자별 정산 상태
// PUT    /api/shared/:subId/settlements       정산 완료/취소 (owner)
//                                             { uid, due_date, paid }
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";
import { todayKST, isValidDate, isNonNegInt } from "../utils/common.js";
import { recalcShares } from "../utils/shares.js";

const router = Router();

const parseId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// 구독 + 요청자의 멤버 정보. 권한 검사에 사용
async function loadAccess(conn, subId, uid) {
    const [[row]] = await conn.query(
        `SELECT s.sub_id, s.uid AS owner_uid, s.title, s.price, s.billing_cycle,
                s.billing_date, s.start_date, s.end_date, s.split_type, s.status,
                me.role, me.status AS my_status
         FROM subscription s
         LEFT JOIN subscription_member me ON me.sub_id = s.sub_id AND me.uid = ?
         WHERE s.sub_id = ?`,
        [uid, subId],
    );
    return row ?? null;
}

const isOwner = (a, uid) => a && a.owner_uid === uid;
// 참여 중이거나 초대받은 사람은 상세를 볼 수 있다
const canView = (a, uid) =>
    a && (isOwner(a, uid) || ["joined", "invited"].includes(a.my_status));

async function areFriends(conn, a, b) {
    const [[rel]] = await conn.query(
        `SELECT 1 FROM friends
         WHERE status = 'accepted'
           AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))`,
        [a, b, b, a],
    );
    return !!rel;
}

// 해당 월(YYYY-MM)에 이 구독의 결제 회차가 있으면 그 결제일, 없으면 null
function dueDateFor(sub, ym) {
    if (!sub.billing_date) return null;
    const [y, m] = ym.split("-").map(Number);
    const bm = Number(sub.billing_date.slice(5, 7));
    const bd = Number(sub.billing_date.slice(8, 10));
    if (sub.billing_cycle === "yearly" && bm !== m) return null;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const due = `${ym}-${String(Math.min(bd, last)).padStart(2, "0")}`;
    if (sub.start_date && sub.start_date.slice(0, 7) > ym) return null;
    if (sub.end_date && sub.end_date < `${ym}-01`) return null;
    return due;
}

// 여러 단계를 하나의 트랜잭션으로 실행
async function tx(res, next, fn) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const out = await fn(conn);
        if (out?.error) {
            await conn.rollback();
            return res.status(out.status ?? 400).json({ error: out.error });
        }
        await conn.commit();
        res.status(out?.status ?? 200).json(out?.body ?? { success: true });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
}

// ── 나에게 온 초대 ────────────────────────────
router.get("/invites", async (req, res, next) => {
    try {
        const [rows] = await pool.query(
            `SELECT s.sub_id, s.title, s.category, s.price, s.billing_cycle,
                    s.billing_date, s.split_type, o.user_name AS owner_name,
                    (SELECT COUNT(*) FROM subscription_member x
                      WHERE x.sub_id = s.sub_id AND x.status = 'joined') AS member_count
             FROM subscription_member m
             JOIN subscription s ON s.sub_id = m.sub_id
             JOIN user o ON o.uid = s.uid
             WHERE m.uid = ? AND m.status = 'invited' AND s.status = 'subscribed'
             ORDER BY s.title`,
            [req.user.uid],
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ── 초대 수락 / 거절 ──────────────────────────
router.post("/:subId/respond", (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const { action } = req.body;
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });
    if (!["accept", "reject"].includes(action))
        return res
            .status(400)
            .json({ error: "action은 accept 또는 reject여야 합니다" });

    tx(res, next, async (conn) => {
        const a = await loadAccess(conn, subId, uid);
        if (!a || a.my_status !== "invited")
            return { status: 404, error: "초대를 찾을 수 없습니다" };

        if (action === "accept") {
            await conn.query(
                `UPDATE subscription_member SET status = 'joined'
                 WHERE sub_id = ? AND uid = ?`,
                [subId, uid],
            );
        } else {
            // 초대만 받은 상태라 결제·정산 기록이 없으므로 행 삭제
            await conn.query(
                `DELETE FROM subscription_member
                 WHERE sub_id = ? AND uid = ? AND status = 'invited'`,
                [subId, uid],
            );
        }
        const err = await recalcShares(conn, subId);
        if (err) return { error: err };
        return {};
    });
});

// ── 공유 구독 상세 ────────────────────────────
router.get("/:subId", async (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });

    try {
        const a = await loadAccess(pool, subId, uid);
        if (!a) return res.status(404).json({ error: "구독을 찾을 수 없습니다" });
        if (!canView(a, uid))
            return res.status(403).json({ error: "참여자만 볼 수 있습니다" });

        const [members] = await pool.query(
            `SELECT m.uid, u.user_name, m.role, m.share_amount, m.status
             FROM subscription_member m
             JOIN user u ON u.uid = m.uid
             WHERE m.sub_id = ? AND m.status <> 'left'
             ORDER BY m.role = 'owner' DESC, m.status, u.user_name`,
            [subId],
        );
        res.json({
            sub_id: a.sub_id,
            title: a.title,
            price: a.price,
            billing_cycle: a.billing_cycle,
            billing_date: a.billing_date,
            split_type: a.split_type,
            status: a.status,
            is_owner: isOwner(a, uid),
            members,
        });
    } catch (err) {
        next(err);
    }
});

// ── 친구 초대 ─────────────────────────────────
router.post("/:subId/members", (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const target = parseId(req.body.uid);
    if (!subId || !target)
        return res.status(400).json({ error: "구독 id와 초대할 uid가 필요합니다" });
    if (target === uid)
        return res.status(400).json({ error: "자기 자신은 초대할 수 없습니다" });

    tx(res, next, async (conn) => {
        const a = await loadAccess(conn, subId, uid);
        if (!a) return { status: 404, error: "구독을 찾을 수 없습니다" };
        if (!isOwner(a, uid))
            return { status: 403, error: "구독 소유자만 초대할 수 있습니다" };
        if (a.status !== "subscribed")
            return { error: "해지한 구독에는 초대할 수 없습니다" };
        if (!(await areFriends(conn, uid, target)))
            return { status: 403, error: "친구만 초대할 수 있습니다" };

        const [[cur]] = await conn.query(
            `SELECT status FROM subscription_member WHERE sub_id = ? AND uid = ?`,
            [subId, target],
        );
        if (cur && cur.status !== "left")
            return { status: 409, error: "이미 초대했거나 참여 중인 친구입니다" };

        if (cur) {
            // 예전에 나갔던 친구를 다시 초대
            await conn.query(
                `UPDATE subscription_member SET status = 'invited', share_amount = 0
                 WHERE sub_id = ? AND uid = ?`,
                [subId, target],
            );
        } else {
            await conn.query(
                `INSERT INTO subscription_member (sub_id, uid, role, share_amount, status)
                 VALUES (?, ?, 'member', 0, 'invited')`,
                [subId, target],
            );
        }
        const err = await recalcShares(conn, subId);
        if (err) return { error: err };
        return { status: 201 };
    });
});

// ── 내보내기 / 나가기 ─────────────────────────
// 결제·정산 기록이 있으면 이력 보존을 위해 left, 없으면 행 삭제
router.delete("/:subId/members/:uid", (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const target = parseId(req.params.uid);
    if (!subId || !target)
        return res.status(400).json({ error: "잘못된 요청입니다" });

    tx(res, next, async (conn) => {
        const a = await loadAccess(conn, subId, uid);
        if (!a) return { status: 404, error: "구독을 찾을 수 없습니다" };
        const self = target === uid;
        if (!self && !isOwner(a, uid))
            return { status: 403, error: "구독 소유자만 내보낼 수 있습니다" };
        if (target === a.owner_uid)
            return { error: "소유자는 나갈 수 없습니다. 구독을 해지하거나 삭제하세요" };

        const [[m]] = await conn.query(
            `SELECT status FROM subscription_member WHERE sub_id = ? AND uid = ?`,
            [subId, target],
        );
        if (!m || m.status === "left")
            return { status: 404, error: "참여자를 찾을 수 없습니다" };

        const [[{ cnt }]] = await conn.query(
            `SELECT COUNT(*) AS cnt FROM payment WHERE sub_id = ? AND uid = ?`,
            [subId, target],
        );
        if (cnt > 0)
            await conn.query(
                `UPDATE subscription_member SET status = 'left'
                 WHERE sub_id = ? AND uid = ?`,
                [subId, target],
            );
        else
            await conn.query(
                `DELETE FROM subscription_member WHERE sub_id = ? AND uid = ?`,
                [subId, target],
            );

        const err = await recalcShares(conn, subId);
        if (err) return { error: err };
        return { body: { result: cnt > 0 ? "left" : "deleted" } };
    });
});

// ── 분담 방식 변경 ────────────────────────────
// equal  : 참여자 수로 자동 계산
// custom : shares에 owner를 제외한 참여자별 금액. owner = 구독료 - 합계
router.put("/:subId/split", (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const { split_type, shares = [] } = req.body;
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });
    if (!["equal", "custom"].includes(split_type))
        return res
            .status(400)
            .json({ error: "split_type은 equal 또는 custom이어야 합니다" });
    if (
        !Array.isArray(shares) ||
        shares.some((x) => !parseId(x?.uid) || !isNonNegInt(x?.amount))
    )
        return res
            .status(400)
            .json({ error: "shares는 [{ uid, amount(0 이상 정수) }] 형식이어야 합니다" });

    tx(res, next, async (conn) => {
        const a = await loadAccess(conn, subId, uid);
        if (!a) return { status: 404, error: "구독을 찾을 수 없습니다" };
        if (!isOwner(a, uid))
            return { status: 403, error: "구독 소유자만 변경할 수 있습니다" };

        await conn.query(`UPDATE subscription SET split_type = ? WHERE sub_id = ?`, [
            split_type,
            subId,
        ]);

        if (split_type === "custom") {
            for (const x of shares) {
                const [r] = await conn.query(
                    `UPDATE subscription_member SET share_amount = ?
                     WHERE sub_id = ? AND uid = ? AND role = 'member' AND status <> 'left'`,
                    [Number(x.amount), subId, Number(x.uid)],
                );
                if (r.affectedRows === 0)
                    return { error: `참여자가 아닌 uid입니다: ${x.uid}` };
            }
        }
        const err = await recalcShares(conn, subId);
        if (err) return { error: err };
        return {};
    });
});

// ── 정산 현황 ─────────────────────────────────
// 해당 월 회차에 대해 owner를 제외한 참여자의 몫과 정산 여부
// 정산 기록이 없거나 paid_at이 NULL이면 미정산
router.get("/:subId/settlements", async (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const ym = req.query.ym ?? todayKST().slice(0, 7);
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym))
        return res.status(400).json({ error: "ym은 YYYY-MM 형식이어야 합니다" });

    try {
        const a = await loadAccess(pool, subId, uid);
        if (!a) return res.status(404).json({ error: "구독을 찾을 수 없습니다" });
        if (!isOwner(a, uid) && a.my_status !== "joined")
            return res.status(403).json({ error: "참여자만 볼 수 있습니다" });

        const due = dueDateFor(a, ym);
        if (!due) return res.json({ ym, due_date: null, items: [] });

        // 이미 기록된 정산은 기록 당시 금액, 아직 없으면 현재 분담액
        const [items] = await pool.query(
            `SELECT m.uid, u.user_name, m.status AS member_status,
                    COALESCE(p.amount, m.share_amount) AS amount,
                    p.paid_at, p.payment_id
             FROM subscription_member m
             JOIN user u ON u.uid = m.uid
             LEFT JOIN payment p
               ON p.sub_id = m.sub_id AND p.uid = m.uid
              AND p.type = 'settlement' AND p.due_date = ?
             WHERE m.sub_id = ? AND m.role = 'member'
               AND (m.status = 'joined' OR p.payment_id IS NOT NULL)
             ORDER BY u.user_name`,
            [due, subId],
        );
        res.json({
            ym,
            due_date: due,
            items: items.map((r) => ({ ...r, paid: r.paid_at != null })),
        });
    } catch (err) {
        next(err);
    }
});

// ── 정산 완료 / 취소 (owner) ──────────────────
router.put("/:subId/settlements", (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseId(req.params.subId);
    const target = parseId(req.body.uid);
    const { due_date, paid } = req.body;
    if (!subId || !target)
        return res.status(400).json({ error: "구독 id와 uid가 필요합니다" });
    if (!isValidDate(due_date))
        return res.status(400).json({ error: "due_date는 YYYY-MM-DD 형식이어야 합니다" });
    if (typeof paid !== "boolean")
        return res.status(400).json({ error: "paid는 true 또는 false여야 합니다" });

    tx(res, next, async (conn) => {
        const a = await loadAccess(conn, subId, uid);
        if (!a) return { status: 404, error: "구독을 찾을 수 없습니다" };
        if (!isOwner(a, uid))
            return { status: 403, error: "구독 소유자만 정산을 기록할 수 있습니다" };
        if (dueDateFor(a, due_date.slice(0, 7)) !== due_date)
            return { error: "이 구독의 결제 회차가 아닌 날짜입니다" };

        const [[m]] = await conn.query(
            `SELECT share_amount, role FROM subscription_member
             WHERE sub_id = ? AND uid = ?`,
            [subId, target],
        );
        if (!m || m.role !== "member")
            return { status: 404, error: "참여자를 찾을 수 없습니다" };

        // 없으면 현재 분담액으로 정산 행 생성, 있으면 paid_at만 변경 (금액 이력 유지)
        await conn.query(
            `INSERT INTO payment (sub_id, uid, type, amount, due_date, paid_at)
             VALUES (?, ?, 'settlement', ?, ?, ?)
             ON DUPLICATE KEY UPDATE paid_at = VALUES(paid_at)`,
            [subId, target, m.share_amount, due_date, paid ? todayKST() : null],
        );
        return {};
    });
});

export default router;
