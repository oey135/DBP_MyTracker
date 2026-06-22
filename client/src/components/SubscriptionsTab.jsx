// ─────────────────────────────────────────────
// components/SubscriptionsTab.jsx
// 구독 관리 탭 — 필터링 + 카드 목록 + 수정·삭제·복구 액션
// ─────────────────────────────────────────────

import { useState } from "react";
import { formatPrice, formatBillingDay, getDaysUntil } from "../utils/subscriptionUtils";
import { getServiceMeta } from "../constants/serviceMeta";

export default function SubscriptionsTab({ subscriptions, onAdd, onEdit, onDelete, onRestore }) {
  const [filter, setFilter] = useState("subscribed");
  const [search, setSearch] = useState("");

  const filtered = subscriptions.filter(s => {
    const matchFilter = filter === "all" ? true : s.status === filter;
    const matchSearch = s.title.toLowerCase().includes(search.toLowerCase()) ||
                        (s.memo ?? "").toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });
  const monthlyTotal = filtered
    .filter(s => s.status === "subscribed")
    .reduce((sum, s) => sum + s.price, 0);

  return (
    <div style={{ padding: "20px 20px 16px" }}>

      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "#1A1A2E" }}>구독 관리</h1>
        <button
          onClick={onAdd}
          style={{
            background: "#7F77DD", color: "#fff", border: "none", borderRadius: 20,
            padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          + 추가
        </button>
      </div>

      {/* 검색창 */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          fontSize: 15, color: "#bbb", pointerEvents: "none",
        }}>🔍</span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="서비스명 또는 메모 검색"
          style={{
            width: "100%", padding: "10px 36px 10px 36px", borderRadius: 12,
            border: "1.5px solid #E8E8E8", fontSize: 14, outline: "none",
            boxSizing: "border-box", background: "#F8F8F8", color: "#1A1A2E",
            fontFamily: "inherit",
          }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 16, color: "#bbb", padding: 0, lineHeight: 1,
            }}
          >✕</button>
        )}
      </div>

      {/* 필터 탭 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["subscribed", "구독 중"], ["cancelled", "취소됨"], ["all", "전체"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: filter === val ? "#7F77DD" : "#F5F5F5",
              color:      filter === val ? "#fff"    : "#666",
              border: "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 월 합계 (구독 중 또는 전체 탭에서만) */}
      {filter !== "cancelled" && (
        <div style={{
          background: "#F8F7FF", borderRadius: 14, padding: "12px 16px",
          marginBottom: 16, display: "flex", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, color: "#7F77DD", fontWeight: 500 }}>월 합계</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#534AB7" }}>{formatPrice(monthlyTotal)}</span>
        </div>
      )}

      {/* 구독 카드 목록 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#ccc" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>📭</div>
            <p style={{ fontSize: 14 }}>구독이 없습니다</p>
          </div>
        ) : filtered.map(s => (
          <SubscriptionCard
            key={s.title}
            sub={s}
            onEdit={onEdit}
            onDelete={onDelete}
            onRestore={onRestore}
          />
        ))}
      </div>
    </div>
  );
}

// ── 개별 구독 카드 ────────────────────────────
function SubscriptionCard({ sub: s, onEdit, onDelete, onRestore }) {
  const meta    = getServiceMeta(s.title);
  const days    = getDaysUntil(s.billing_date);
  const isCancelled = s.status === "cancelled";

  return (
    <div style={{
      background:   isCancelled ? "#FAFAFA" : "#fff",
      border:       `1px solid ${isCancelled ? "#EBEBEB" : "#F0F0F0"}`,
      borderRadius: 16, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* 아이콘 */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: meta.bg,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, flexShrink: 0,
          opacity: isCancelled ? 0.45 : 1,
        }}>
          {meta.icon}
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* 1행: 이름+뱃지 / 금액 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <p style={{
                  fontWeight: 700, fontSize: 15, margin: 0,
                  color:          isCancelled ? "#aaa"        : "#1A1A2E",
                  textDecoration: isCancelled ? "line-through" : "none",
                }}>
                  {s.title}
                </p>
                {isCancelled && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: "#E85D14",
                    background: "#FFF4EE", borderRadius: 6, padding: "1px 6px", flexShrink: 0,
                  }}>
                    해지됨
                  </span>
                )}
              </div>
              <p style={{ fontSize: 12, color: "#aaa", margin: "3px 0 0" }}>
                {isCancelled
                  ? `${formatBillingDay(s.billing_date)} 결제 예정이었음`
                  : `${formatBillingDay(s.billing_date)} 결제 (${days >= 0 ? `${days}일 후` : "지남"})`}
              </p>
            </div>
            <p style={{
              fontWeight: 700, fontSize: 16, margin: 0, flexShrink: 0,
              color: isCancelled ? "#ccc" : "#1A1A2E",
            }}>
              {formatPrice(s.price)}
            </p>
          </div>

          {/* 2행: 메모 + 버튼 (메모가 있든 없든 버튼은 항상 오른쪽 하단) */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8, gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {s.memo && (
                <p style={{
                  fontSize: 12, color: "#999", margin: 0,
                  background: "#F5F5F5", borderRadius: 6,
                  padding: "3px 8px", display: "inline-block",
                  maxWidth: "100%", wordBreak: "break-all",
                }}>
                  {s.memo}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0 }}>
              {isCancelled ? (
                <button
                  onClick={() => onRestore(s.title)}
                  style={{
                    fontSize: 11, padding: "4px 10px", borderRadius: 8,
                    background: "#EDF7F0", border: "none", cursor: "pointer",
                    color: "#1D9E75", fontWeight: 600,
                  }}
                >
                  복구
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => onEdit(s)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 8,
                      background: "#F5F5F5", border: "none", cursor: "pointer", color: "#555",
                    }}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => onDelete(s.title)}
                    style={{
                      fontSize: 11, padding: "4px 10px", borderRadius: 8,
                      background: "#FFF0F0", border: "none", cursor: "pointer", color: "#E50914",
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
