// ─────────────────────────────────────────────
// constants/categories.js
// ─────────────────────────────────────────────

// 카테고리 (server/myTracker.sql subscription.category ENUM과 동일)
export const CATEGORY_OPTIONS = [
    ["ott", "영상"],
    ["music", "음악"],
    ["reading", "도서·웹툰"],
    ["productivity", "생산성·AI"],
    ["cloud", "클라우드"],
    ["game", "게임"],
    ["shopping", "쇼핑·멤버십"],
    ["etc", "기타"],
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORY_OPTIONS);
