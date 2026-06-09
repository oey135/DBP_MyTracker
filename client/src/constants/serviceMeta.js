// ─────────────────────────────────────────────
// constants/serviceMeta.js
// 구독 서비스별 아이콘·색상 메타데이터
// ─────────────────────────────────────────────

export const SERVICE_META = {
  "Netflix":            { icon: "📺", color: "#E50914", bg: "#FFF0F0" },
  "Spotify":            { icon: "🎵", color: "#1DB954", bg: "#F0FFF4" },
  "YouTube Premium":    { icon: "▶️",  color: "#FF0000", bg: "#FFF0F0" },
  "Apple One":          { icon: "🍎", color: "#555555", bg: "#F5F5F5" },
  "Coupang Rocket Wow": { icon: "📦", color: "#E85D14", bg: "#FFF4EE" },
  "Toss Plus":          { icon: "💳", color: "#0064FF", bg: "#EFF5FF" },
  "Disney+":            { icon: "🏰", color: "#113CCF", bg: "#EEF1FF" },
  "Watcha":             { icon: "🎬", color: "#FF2B5E", bg: "#FFF0F4" },
  "Webtoon":            { icon: "📖", color: "#00D564", bg: "#EDFFF6" },
  "Naver Plus":         { icon: "🟢", color: "#03C75A", bg: "#EDFFF5" },
};

/** 등록되지 않은 서비스는 기본값 반환 */
export const getServiceMeta = (title) =>
  SERVICE_META[title] ?? { icon: "💰", color: "#7F77DD", bg: "#EEEDFE" };

/** 현재 로그인한 사용자 UID (실제 서비스에서는 auth context로 교체) */
export const CURRENT_UID = 1;

/** 달 이름 배열 */
export const MONTH_KO = [
  "1월","2월","3월","4월","5월","6월",
  "7월","8월","9월","10월","11월","12월",
];

/** 요일 이름 배열 (일요일부터) */
export const DOW = ["일","월","화","수","목","금","토"];
