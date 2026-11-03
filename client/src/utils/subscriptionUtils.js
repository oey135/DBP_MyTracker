// ─────────────────────────────────────────────
// utils/subscriptionUtils.js
// billing_date 관련 날짜 계산 + 금액 포맷 유틸
//
// billing_date 저장 규칙:
//   "2000-01-DD" 형태 — 연·월은 더미, 일(day)만 의미 있음
//   DBML 주석: note: "일자만 사용"
// ─────────────────────────────────────────────

export const DAYS_2000 = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "2000-03-15" → 3 */
export const getBillingMonth = (billingDate) =>
    billingDate ? parseInt(billingDate.split("-")[1], 10) : null;

/** 주기에 맞는 billing_date 생성 (월간은 1월 고정, 없는 날짜는 말일로 보정) */
export const buildBilling = (cycle, month, day) => {
    const m = cycle === "yearly" ? month : 1;
    const d = Math.min(day, DAYS_2000[m - 1]);
    return `2000-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

/** 월 환산 금액 (연간은 12로 나눔) */
export const monthlyCost = (sub) =>
    sub.billing_cycle === "yearly" ? Math.round(sub.price / 12) : sub.price;

/** "2000-01-15" → 15 */
export const getBillingDay = (billingDate) => {
    if (!billingDate) return null;
    return parseInt(billingDate.split("-")[2], 10);
};

/** "2000-01-15" → "매월 15일" */
export const formatBillingDay = (billingDate, cycle = "monthly") => {
    const day = getBillingDay(billingDate);
    if (!day) return "";
    return cycle === "yearly"
        ? `매년 ${getBillingMonth(billingDate)}월 ${day}일`
        : `매월 ${day}일`;
};

export const getNextBillingDate = (billingDate, cycle = "monthly") => {
    const day = getBillingDay(billingDate);
    if (!day) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (cycle === "yearly") {
        const m = getBillingMonth(billingDate) - 1;
        const at = (y) =>
            new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));
        const thisYear = at(today.getFullYear());
        return thisYear >= today ? thisYear : at(today.getFullYear() + 1);
    }

    const candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
};

export const getDaysUntil = (billingDate, cycle = "monthly") => {
    const next = getNextBillingDate(billingDate, cycle);
    if (!next) return 999;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((next - today) / 86400000);
};

export const formatNextDate = (billingDate, cycle = "monthly") => {
    const next = getNextBillingDate(billingDate, cycle);
    if (!next) return "";
    return `${next.getMonth() + 1}월 ${next.getDate()}일`;
};

/** 숫자 → "17,000원" */
export const formatPrice = (p) => p.toLocaleString("ko-KR") + "원";

/**
 * 특정 구독이 주어진 year/month에 결제 대상인지 판별
 *
 * subscribed : start_date ≤ 해당 달  (상한 없음)
 * cancelled  : start_date ≤ 해당 달 ≤ 현재 달
 *              (해지됐으므로 미래 달에는 표시 안 함)
 *
 * 복구 시 start_date 를 오늘로 갱신 → 복구한 달부터 다시 포함
 */
export const wasActiveInMonth = (sub, year, month) => {
    if (!sub.start_date) return false;
    if (
        sub.billing_cycle === "yearly" &&
        getBillingMonth(sub.billing_date) !== month + 1
    )
        return false;

    const parts = sub.start_date.split("-");
    const startY = parseInt(parts[0]);
    const startM = parseInt(parts[1]) - 1; // 0-indexed

    // 시작 전 달이면 제외
    if (year < startY || (year === startY && month < startM)) return false;

    if (sub.status === "cancelled") {
        // 현재 달 이후 미래는 표시 안 함
        const now = new Date();
        const nowY = now.getFullYear();
        const nowM = now.getMonth();
        if (year > nowY || (year === nowY && month > nowM)) return false;
    }

    return true;
};

/**
 * 해당 월의 실제 결제일 계산
 * (결제일 day > 해당 월 말일이면 말일로 처리)
 */
export const effectiveBillingDay = (billingDate, daysInMonth) => {
    const day = getBillingDay(billingDate);
    if (!day) return null;
    return day > daysInMonth ? daysInMonth : day;
};
