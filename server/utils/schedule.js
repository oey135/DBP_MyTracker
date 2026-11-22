// ─────────────────────────────────────────────
// server/utils/schedule.js  —  결제 회차 계산
// billing_date는 2000년 고정 인코딩 (monthly: 2000-01-DD, yearly: 2000-MM-DD)
// ─────────────────────────────────────────────

// 해당 월(YYYY-MM)에 이 구독의 결제 회차가 있으면 그 결제일, 없으면 null
export function dueDateFor(sub, ym) {
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
