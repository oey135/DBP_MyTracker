// ─────────────────────────────────────────────
// server/routes/subscriptions.js
//
// GET    /api/subscriptions                내 구독 목록 (내가 소유자인 구독)
// POST   /api/subscriptions                구독 추가 (owner 멤버 행 함께 생성)
// PUT    /api/subscriptions/:subId         구독 수정 (해지·복구 포함)
// DELETE /api/subscriptions/:subId         구독 삭제
//                                          결제 기록 없음 → 실제 삭제
//                                          결제 기록 있음 → 해지(cancelled)로 대체
//
// GET    /api/subscriptions/friend/:uid    친구가 공개한 구독 목록
// ─────────────────────────────────────────────

import { Router } from "express";
import pool from "../db.js";
import {
    todayKST,
    isValidDate,
    isNonNegInt,
    isCheckViolation,
} from "../utils/common.js";
import { recalcShares } from "../utils/shares.js";

const router = Router();

export const CATEGORIES = [
    "ott",
    "music",
    "reading",
    "productivity",
    "cloud",
    "game",
    "shopping",
    "etc",
];
const VISIBILITY = ["private", "friends"];
const SPLIT_TYPES = ["equal", "custom"];
const STATUSES = ["subscribed", "cancelled"];

const DAYS_2000 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2000년은 윤년

const SUB_COLUMNS = `s.sub_id, s.uid, s.title, s.category, s.price, s.billing_cycle,
    s.billing_date, s.start_date, s.end_date, s.notify_days_before,
    s.visibility, s.split_type, s.memo, s.status`;

// 통과하면 null, 실패하면 오류 메시지 반환
function checkBilling(cycle, date) {
    if (!["monthly", "yearly"].includes(cycle))
        return "billing_cycle은 monthly 또는 yearly여야 합니다";
    const m = /^2000-(\d{2})-(\d{2})$/.exec(date ?? "");
    if (!m) return "billing_date는 2000-MM-DD 형식이어야 합니다";
    const mm = Number(m[1]),
        dd = Number(m[2]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > DAYS_2000[mm - 1])
        return "유효하지 않은 결제일입니다";
    if (cycle === "monthly" && mm !== 1)
        return "월간 구독의 billing_date는 2000-01-DD 형식이어야 합니다";
    return null;
}

// 구독 한 건의 최종 값(기존 값 + 변경 값)을 검증. 통과하면 null
function validateSub(s) {
    if (!s.title || !String(s.title).trim()) return "title은 필수입니다";
    if (String(s.title).length > 50) return "title은 50자 이하여야 합니다";
    if (!isNonNegInt(s.price)) return "price는 0 이상의 정수여야 합니다";
    if (!s.billing_date) return "billing_date는 필수입니다";
    const billingErr = checkBilling(s.billing_cycle, s.billing_date);
    if (billingErr) return billingErr;
    if (!CATEGORIES.includes(s.category))
        return `category는 ${CATEGORIES.join(", ")} 중 하나여야 합니다`;
    if (!VISIBILITY.includes(s.visibility))
        return "visibility는 private 또는 friends여야 합니다";
    if (!SPLIT_TYPES.includes(s.split_type))
        return "split_type은 equal 또는 custom이어야 합니다";
    if (!STATUSES.includes(s.status))
        return "status는 subscribed 또는 cancelled여야 합니다";
    if (
        s.notify_days_before != null &&
        (!isNonNegInt(s.notify_days_before) ||
            Number(s.notify_days_before) > 30)
    )
        return "notify_days_before는 0~30 사이여야 합니다";
    if (s.start_date && !isValidDate(s.start_date))
        return "start_date는 YYYY-MM-DD 형식이어야 합니다";
    if (s.end_date && !isValidDate(s.end_date))
        return "end_date는 YYYY-MM-DD 형식이어야 합니다";
    if (s.start_date && s.end_date && s.end_date < s.start_date)
        return "종료일은 시작일보다 빠를 수 없습니다";
    if (s.status === "cancelled" && !s.end_date)
        return "해지한 구독은 종료일이 필요합니다";
    return null;
}

// 해지 시 종료일 기본값: 오늘 (시작일이 미래면 시작일)
const defaultEndDate = (startDate) => {
    const today = todayKST();
    return startDate && startDate > today ? startDate : today;
};

// 같은 소유자에게 구독 중인 같은 이름의 서비스가 있는지
async function hasActiveDuplicate(conn, uid, title, exceptSubId = null) {
    const [[dup]] = await conn.query(
        `SELECT 1 FROM subscription
         WHERE uid = ? AND title = ? AND status = 'subscribed'
           AND (? IS NULL OR sub_id <> ?)
         LIMIT 1`,
        [uid, title, exceptSubId, exceptSubId],
    );
    return !!dup;
}

const parseSubId = (v) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
};

// ── 내 구독 목록 ──────────────────────────────
// GET /api/subscriptions
// 내가 소유한 구독 + 참여(joined) 중인 공유 구독
//   role        : owner | member
//   my_share    : 내 부담액 (개인 구독은 구독료 전액)
//   member_count: 참여 중인 인원 (owner 포함). 2 이상이면 공유 구독
//   owner_name  : 소유자 이름
router.get("/", async (req, res, next) => {
    const uid = req.user.uid;
    try {
        const [rows] = await pool.query(
            `SELECT ${SUB_COLUMNS},
                    me.role, me.share_amount AS my_share,
                    o.user_name AS owner_name,
                    (SELECT COUNT(*) FROM subscription_member x
                      WHERE x.sub_id = s.sub_id AND x.status = 'joined') AS member_count
             FROM subscription s
             JOIN subscription_member me
               ON me.sub_id = s.sub_id AND me.uid = ? AND me.status = 'joined'
             JOIN user o ON o.uid = s.uid
             ORDER BY s.status = 'cancelled', s.title, s.sub_id`,
            [uid],
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

// ── 구독 추가 ─────────────────────────────────
// POST /api/subscriptions
// body: { title, price, billing_date, billing_cycle?, category?, start_date?,
//         end_date?, notify_days_before?, visibility?, split_type?, memo?, status? }
router.post("/", async (req, res, next) => {
    const uid = req.user.uid;
    const sub = {
        title: req.body.title?.trim(),
        price: req.body.price,
        category: req.body.category ?? "etc",
        billing_cycle: req.body.billing_cycle ?? "monthly",
        billing_date: req.body.billing_date,
        start_date: req.body.start_date || null,
        end_date: req.body.end_date || null,
        notify_days_before:
            req.body.notify_days_before === "" ||
            req.body.notify_days_before === undefined
                ? null
                : req.body.notify_days_before,
        visibility: req.body.visibility ?? "private",
        split_type: req.body.split_type ?? "equal",
        memo: req.body.memo ?? "",
        status: req.body.status ?? "subscribed",
    };
    if (sub.status === "cancelled" && !sub.end_date)
        sub.end_date = defaultEndDate(sub.start_date);
    if (sub.status === "subscribed") sub.end_date = null;

    const err = validateSub(sub);
    if (err) return res.status(400).json({ error: err });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (
            sub.status === "subscribed" &&
            (await hasActiveDuplicate(conn, uid, sub.title))
        ) {
            await conn.rollback();
            return res.status(409).json({ error: "이미 등록된 서비스입니다" });
        }

        const [result] = await conn.query(
            `INSERT INTO subscription
               (uid, title, category, price, billing_cycle, billing_date,
                start_date, end_date, notify_days_before, visibility,
                split_type, memo, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                uid,
                sub.title,
                sub.category,
                Number(sub.price),
                sub.billing_cycle,
                sub.billing_date,
                sub.start_date,
                sub.end_date,
                sub.notify_days_before == null
                    ? null
                    : Number(sub.notify_days_before),
                sub.visibility,
                sub.split_type,
                sub.memo,
                sub.status,
            ],
        );
        const subId = result.insertId;

        // 소유자도 멤버 행으로 포함 (개인 구독 = owner 행 1개)
        await conn.query(
            `INSERT INTO subscription_member (sub_id, uid, role, share_amount, status)
             VALUES (?, ?, 'owner', ?, 'joined')`,
            [subId, uid, Number(sub.price)],
        );

        await conn.commit();

        const [[created]] = await pool.query(
            `SELECT ${SUB_COLUMNS} FROM subscription s WHERE s.sub_id = ?`,
            [subId],
        );
        res.status(201).json(created);
    } catch (e) {
        await conn.rollback();
        if (isCheckViolation(e))
            return res
                .status(400)
                .json({ error: "입력값이 데이터 규칙에 맞지 않습니다" });
        next(e);
    } finally {
        conn.release();
    }
});

// ── 구독 수정 ─────────────────────────────────
// PUT /api/subscriptions/:subId
// body: 변경할 필드만 전달
//   status → cancelled : end_date 미지정 시 오늘로 기록
//   status → subscribed: 복구. start_date 미지정 시 오늘, end_date는 비움
router.put("/:subId", async (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseSubId(req.params.subId);
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });

    const allowed = [
        "title",
        "category",
        "price",
        "billing_cycle",
        "billing_date",
        "start_date",
        "end_date",
        "notify_days_before",
        "visibility",
        "split_type",
        "memo",
        "status",
    ];
    const updates = {};
    for (const k of allowed) if (k in req.body) updates[k] = req.body[k];
    if (Object.keys(updates).length === 0)
        return res.status(400).json({ error: "변경할 필드가 없습니다" });

    // 빈 문자열은 NULL로 저장
    for (const k of ["start_date", "end_date", "notify_days_before"])
        if (updates[k] === "") updates[k] = null;
    if (typeof updates.title === "string") updates.title = updates.title.trim();

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[cur]] = await conn.query(
            `SELECT ${SUB_COLUMNS} FROM subscription s
             WHERE s.sub_id = ? FOR UPDATE`,
            [subId],
        );
        if (!cur) {
            await conn.rollback();
            return res.status(404).json({ error: "구독을 찾을 수 없습니다" });
        }
        if (cur.uid !== uid) {
            await conn.rollback();
            return res
                .status(403)
                .json({ error: "구독 소유자만 수정할 수 있습니다" });
        }

        // 해지 / 복구 처리
        if (updates.status === "cancelled" && cur.status !== "cancelled") {
            if (!updates.end_date)
                updates.end_date = defaultEndDate(
                    updates.start_date ?? cur.start_date,
                );
        } else if (
            updates.status === "subscribed" &&
            cur.status === "cancelled"
        ) {
            if (!updates.start_date) updates.start_date = todayKST();
            updates.end_date = null;
        }

        const next_ = { ...cur, ...updates };
        const err = validateSub(next_);
        if (err) {
            await conn.rollback();
            return res.status(400).json({ error: err });
        }

        if (
            next_.status === "subscribed" &&
            (updates.title !== undefined || updates.status !== undefined) &&
            (await hasActiveDuplicate(conn, uid, next_.title, subId))
        ) {
            await conn.rollback();
            return res.status(409).json({ error: "이미 등록된 서비스입니다" });
        }

        const fields = Object.keys(updates);
        await conn.query(
            `UPDATE subscription SET ${fields.map((f) => `${f} = ?`).join(", ")}
             WHERE sub_id = ?`,
            [...fields.map((f) => updates[f]), subId],
        );

        // 금액이나 분담 방식이 바뀌면 분담액 다시 계산
        if ("price" in updates || "split_type" in updates) {
            const shareErr = await recalcShares(conn, subId);
            if (shareErr) {
                await conn.rollback();
                return res.status(400).json({ error: shareErr });
            }
        }

        await conn.commit();

        const [[updated]] = await pool.query(
            `SELECT ${SUB_COLUMNS} FROM subscription s WHERE s.sub_id = ?`,
            [subId],
        );
        res.json(updated);
    } catch (e) {
        await conn.rollback();
        if (isCheckViolation(e))
            return res
                .status(400)
                .json({ error: "입력값이 데이터 규칙에 맞지 않습니다" });
        next(e);
    } finally {
        conn.release();
    }
});

// ── 구독 삭제 ─────────────────────────────────
// DELETE /api/subscriptions/:subId
// 반환: { result: "deleted" } 또는 { result: "cancelled" } (결제 기록이 있어 해지로 대체)
router.delete("/:subId", async (req, res, next) => {
    const uid = req.user.uid;
    const subId = parseSubId(req.params.subId);
    if (!subId) return res.status(400).json({ error: "잘못된 구독 id입니다" });

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[sub]] = await conn.query(
            `SELECT uid, start_date, status FROM subscription
             WHERE sub_id = ? FOR UPDATE`,
            [subId],
        );
        if (!sub) {
            await conn.rollback();
            return res.status(404).json({ error: "구독을 찾을 수 없습니다" });
        }
        if (sub.uid !== uid) {
            await conn.rollback();
            return res
                .status(403)
                .json({ error: "구독 소유자만 삭제할 수 있습니다" });
        }

        const [[{ cnt }]] = await conn.query(
            `SELECT COUNT(*) AS cnt FROM payment WHERE sub_id = ?`,
            [subId],
        );

        if (cnt > 0) {
            // 결제 기록이 있으면 이력을 지키기 위해 해지로 대체
            if (sub.status !== "cancelled")
                await conn.query(
                    `UPDATE subscription SET status = 'cancelled', end_date = ?
                     WHERE sub_id = ?`,
                    [defaultEndDate(sub.start_date), subId],
                );
            await conn.commit();
            return res.json({ result: "cancelled" });
        }

        await conn.query(`DELETE FROM subscription_member WHERE sub_id = ?`, [
            subId,
        ]);
        await conn.query(`DELETE FROM subscription WHERE sub_id = ?`, [subId]);
        await conn.commit();
        res.json({ result: "deleted" });
    } catch (e) {
        await conn.rollback();
        next(e);
    } finally {
        conn.release();
    }
});

// ── 친구가 공개한 구독 목록 ───────────────────
// GET /api/subscriptions/friend/:uid
router.get("/friend/:uid", async (req, res, next) => {
    const myUid = req.user.uid;
    const friendUid = Number(req.params.uid);
    if (!Number.isInteger(friendUid))
        return res.status(400).json({ error: "잘못된 사용자 id입니다" });

    try {
        // 1) 친구 관계 확인 (accepted인 경우만 허용)
        const [[rel]] = await pool.query(
            `SELECT 1 FROM friends
             WHERE status = 'accepted'
               AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))`,
            [myUid, friendUid, friendUid, myUid],
        );
        if (!rel)
            return res.status(403).json({ error: "친구 관계가 아닙니다" });

        // 2) 친구가 공개한 구독 중 구독 중인 것만
        const [rows] = await pool.query(
            `SELECT sub_id, title, category, price, billing_cycle, billing_date, memo
             FROM subscription
             WHERE uid = ? AND status = 'subscribed' AND visibility = 'friends'
             ORDER BY title`,
            [friendUid],
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

export default router;
