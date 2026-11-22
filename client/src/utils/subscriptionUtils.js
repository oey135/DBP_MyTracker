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

/** 내 부담액 (공유 구독이면 내 몫, 개인 구독이면 구독료 전액) */
export const myAmount = (sub) => sub.my_share ?? sub.price;

/** 공유 구독인지 (owner 포함 참여자 2명 이상이거나 내가 참여자) */
export const isShared = (sub) =>
    sub.role === "member" || (sub.member_count ?? 1) > 1;

/** 월 환산 금액 (연간은 12로 나눔) — 내 부담액 기준 */
export const monthlyCost = (sub) =>
    sub.billing_cycle === "yearly" ? Math.round(myAmount(sub) / 12) : myAmount(sub);

/** 연간 금액 — 내 부담액 기준 */
export const annualCost = (sub) =>
    sub.billing_cycle === "yearly" ? myAmount(sub) : myAmount(sub) * 12;

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

    // y년 m월(0부터)의 결제일. 그 달에 없는 날짜는 말일로 보정한다.
    // m이 12 이상이어도 JS Date가 연도를 넘겨서 처리한다.
    const at = (y, m) =>
        new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()));

    if (cycle === "yearly") {
        const m = getBillingMonth(billingDate) - 1;
        const thisYear = at(today.getFullYear(), m);
        return thisYear >= today ? thisYear : at(today.getFullYear() + 1, m);
    }

    const thisMonth = at(today.getFullYear(), today.getMonth());
    return thisMonth >= today
        ? thisMonth
        : at(today.getFullYear(), today.getMonth() + 1);
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
 * start_date ≤ 해당 달 이어야 하고,
 * end_date가 있으면 해당 달 ≤ end_date의 달 (해지한 달까지만 표시)
 * end_date 없이 cancelled인 예전 데이터는 현재 달까지만 표시
 *
 * 복구 시 서버가 start_date를 오늘로 갱신 → 복구한 달부터 다시 포함
 */
export const wasActiveInMonth = (sub, year, month) => {
    if (!sub.start_date) return false;
    if (
        sub.billing_cycle === "yearly" &&
        getBillingMonth(sub.billing_date) !== month + 1
    )
        return false;

    const [startY, startM] = sub.start_date.split("-").map(Number);
    // 시작 전 달이면 제외 (month는 0부터)
    if (year < startY || (year === startY && month < startM - 1)) return false;

    let endY = null,
        endM = null;
    if (sub.end_date) {
        [endY, endM] = sub.end_date.split("-").map(Number);
        endM -= 1;
    } else if (sub.status === "cancelled") {
        const now = new Date();
        endY = now.getFullYear();
        endM = now.getMonth();
    }
    if (endY !== null && (year > endY || (year === endY && month > endM)))
        return false;

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
