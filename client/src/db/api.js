// ─────────────────────────────────────────────
// src/db/api.js  —  프론트엔드 API 클라이언트
// mockDB.js를 대체 — 모든 함수가 동일한 시그니처를 유지하므로
// 다른 컴포넌트 파일은 수정 없이 그대로 사용 가능
// ─────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// ── 토큰 관리 ─────────────────────────────────
// 실제 서비스에서는 httpOnly 쿠키 방식을 권장
export const getToken  = ()          => localStorage.getItem("mt_token");
export const setToken  = (token)     => localStorage.setItem("mt_token", token);
export const clearToken = ()         => localStorage.removeItem("mt_token");

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── 공통 fetch 래퍼 ──────────────────────────
async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // 204 No Content
  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// ── 인증 ──────────────────────────────────────

export const register = (user_name, email, password) =>
  request("POST", "/api/auth/register", { user_name, email, password });

export const login = (email, password) =>
  request("POST", "/api/auth/login", { email, password });

// ── subscription CRUD ─────────────────────────

/** 내 구독 목록 조회 */
export const getMySubscriptions = (_uid) =>
  request("GET", "/api/subscriptions");

/** 구독 추가 */
export const addSubscription = (data) =>
  request("POST", "/api/subscriptions", data);

/** 구독 수정 (상태 변경·복구 포함) — sub_id 기준 */
export const updateSubscription = (subId, updates) =>
  request("PUT", `/api/subscriptions/${subId}`, updates);

/** 구독 삭제 — 결제 기록이 있으면 서버가 해지로 대체
 *  반환: { result: "deleted" | "cancelled" } */
export const deleteSubscription = (subId) =>
  request("DELETE", `/api/subscriptions/${subId}`);

// ── payments ──────────────────────────────────

/** 결제 기록 추가 { sub_id, due_date?, paid_at?, amount? } */
export const addPayment = (data) =>
  request("POST", "/api/payments", data);

/** 내 결제 이력 (year 생략 시 전체) */
export const getPayments = (year) =>
  request("GET", `/api/payments${year ? `?year=${year}` : ""}`);

/** 결제 기록 삭제 */
export const deletePayment = (paymentId) =>
  request("DELETE", `/api/payments/${paymentId}`);

/** 친구 구독 목록 (subscribed만) */
export const getFriendSubscriptions = (uid) =>
  request("GET", `/api/subscriptions/friend/${uid}`);

// ── friends ───────────────────────────────────

/** 내 친구 목록 */
export const getFriends = (_uid) =>
  request("GET", "/api/friends");

/** 친구 요청 보내기 */
export const sendFriendRequest = (_sender, user_name) =>
  request("POST", "/api/friends", { user_name });

/** 요청 수락 / 거절 */
export const respondFriendRequest = (senderUid, _receiverUid, action) =>
  request("PUT", `/api/friends/${senderUid}`, { action });

/** 보낸 요청 취소 */
export const cancelFriendRequest = (receiverUid) =>
  request("DELETE", `/api/friends/${receiverUid}`);

/** 친구 삭제 */
export const removeFriend = (friendUid) =>
  request("DELETE", `/api/friends/${friendUid}`);

// ── stats (지출 분석) ─────────────────────────

/** 이번 달·지난달 비교, 월/연 예상, 결제 주기별 비교 (ym: "YYYY-MM") */
export const getStatsOverview = (ym) =>
  request("GET", `/api/stats/overview${ym ? `?ym=${ym}` : ""}`);

/** 월별 예정·실제 지출 추이 */
export const getStatsMonthly = (year) =>
  request("GET", `/api/stats/monthly?year=${year}`);

/** 서비스별·카테고리별 지출 */
export const getStatsBreakdown = (year) =>
  request("GET", `/api/stats/breakdown?year=${year}`);

/** 향후 N개월 예상 지출 */
export const getStatsForecast = (months = 6) =>
  request("GET", `/api/stats/forecast?months=${months}`);

// ── users ─────────────────────────────────────

/** 내 프로필 */
export const getUserById = (_uid) =>
  request("GET", "/api/users/me");

/** 회원 탈퇴 */
export const deleteAccount = () =>
  request("DELETE", "/api/users/me");
