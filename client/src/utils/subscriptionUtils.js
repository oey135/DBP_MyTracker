// ─────────────────────────────────────────────
// utils/subscriptionUtils.js
// billing_date 관련 날짜 계산 + 금액 포맷 유틸
//
// billing_date 저장 규칙:
//   "2000-01-DD" 형태 — 연·월은 더미, 일(day)만 의미 있음
//   DBML 주석: note: "일자만 사용"
// ─────────────────────────────────────────────

/** "2000-01-15" → 15 */
export const getBillingDay = (billingDate) => {
  if (!billingDate) return null;
  return parseInt(billingDate.split("-")[2], 10);
};

/** "2000-01-15" → "매월 15일" */
export const formatBillingDay = (billingDate) => {
  const day = getBillingDay(billingDate);
  return day ? `매월 ${day}일` : "";
};

/** billing_date 기준 다음 결제 Date 객체 반환 */
export const getNextBillingDate = (billingDate) => {
  const day = getBillingDay(billingDate);
  if (!day) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = new Date(today.getFullYear(), today.getMonth(), day);
  if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
  return candidate;
};

/** 다음 결제까지 남은 일수 (오늘 = 0) */
export const getDaysUntil = (billingDate) => {
  const next = getNextBillingDate(billingDate);
  if (!next) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((next - today) / 86400000);
};

/** 다음 결제일을 "N월 M일" 형태로 반환 */
export const formatNextDate = (billingDate) => {
  const next = getNextBillingDate(billingDate);
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

  const parts   = sub.start_date.split("-");
  const startY  = parseInt(parts[0]);
  const startM  = parseInt(parts[1]) - 1; // 0-indexed

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
