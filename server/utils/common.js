// ─────────────────────────────────────────────
// server/utils/common.js  —  라우터 공통 유틸
// ─────────────────────────────────────────────

// 한국 시간 기준 오늘 날짜 "YYYY-MM-DD" (서버가 UTC여도 날짜가 어긋나지 않도록)
export const todayKST = () =>
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

// "YYYY-MM-DD" 형식이면서 실제로 존재하는 날짜인지
export function isValidDate(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// 0 이상의 정수인지
export const isNonNegInt = (v) =>
    v !== null && v !== "" && Number.isInteger(Number(v)) && Number(v) >= 0;

// MySQL CHECK 제약 위반 (errno 3819)
export const isCheckViolation = (err) =>
    err?.code === "ER_CHECK_CONSTRAINT_VIOLATED" || err?.errno === 3819;
