// ─────────────────────────────────────────────
// server/utils/shares.js  —  공유 구독 분담액 계산
// ─────────────────────────────────────────────

// 구독의 분담액(subscription_member.share_amount)을 다시 계산한다.
//   equal  : 참여 중(joined)인 사람 수로 나눔. 나머지는 owner가 부담.
//            초대만 받은(invited) 사람은 수락 전까지 0원
//   custom : 멤버 금액은 그대로 두고 owner = 구독료 - 멤버 합계
// 반환: 문제가 없으면 null, custom 합계가 구독료를 넘으면 오류 메시지
export async function recalcShares(conn, subId) {
    const [[sub]] = await conn.query(
        `SELECT price, split_type FROM subscription WHERE sub_id = ?`,
        [subId],
    );
    if (!sub) return null;

    const [members] = await conn.query(
        `SELECT uid, role, status, share_amount FROM subscription_member
         WHERE sub_id = ?`,
        [subId],
    );
    const set = (uid, amount) =>
        conn.query(
            `UPDATE subscription_member SET share_amount = ?
             WHERE sub_id = ? AND uid = ?`,
            [amount, subId, uid],
        );

    if (sub.split_type === "equal") {
        const joined = members.filter((m) => m.status === "joined");
        const n = Math.max(joined.length, 1);
        const base = Math.floor(sub.price / n);
        const remainder = sub.price - base * n;
        for (const m of members) {
            if (m.status === "left") continue;
            if (m.status === "invited") await set(m.uid, 0);
            else await set(m.uid, m.role === "owner" ? base + remainder : base);
        }
        return null;
    }

    // custom
    const others = members
        .filter((m) => m.role !== "owner" && m.status !== "left")
        .reduce((a, m) => a + m.share_amount, 0);
    if (others > sub.price)
        return "참여자 분담액 합계가 구독료보다 클 수 없습니다";
    const owner = members.find((m) => m.role === "owner");
    if (owner) await set(owner.uid, sub.price - others);
    return null;
}
