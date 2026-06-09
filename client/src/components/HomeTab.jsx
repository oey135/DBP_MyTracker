// ─────────────────────────────────────────────
// components/HomeTab.jsx
// 홈 탭 — 월 결제 요약 카드 + 결제 예정 알림 + 구독 미리보기
// ─────────────────────────────────────────────

import { formatPrice, formatBillingDay, getDaysUntil, formatNextDate } from "../utils/subscriptionUtils";
import { getServiceMeta } from "../constants/serviceMeta";

export default function HomeTab({ subscriptions, onNavigate }) {
  const active  = subscriptions.filter(s => s.status === "subscribed");
  const monthly = active.reduce((sum, s) => sum + s.price, 0);

  const upcomingBills = active
    .map(s => ({ ...s, days: getDaysUntil(s.billing_date) }))
    .filter(s => s.days >= 0 && s.days <= 14)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);

  return (
    <div style={{ padding: "24px 20px 16px" }}>

      {/* 요약 카드 */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: "#999", margin: "0 0 2px" }}>안녕하세요 👋</p>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 20px", color: "#1A1A2E" }}>
          이번 달 구독 현황
        </h1>
        <div style={{
          background: "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)",
          borderRadius: 20, padding: "24px 24px 20px", color: "#fff",
        }}>
          <p style={{ fontSize: 13, opacity: 0.8, margin: "0 0 6px" }}>월 결제 총액</p>
          <p style={{ fontSize: 32, fontWeight: 700, margin: "0 0 16px", letterSpacing: -1 }}>
            {formatPrice(monthly)}
          </p>
          <div style={{ display: "flex", gap: 20 }}>
            <div>
              <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 2px" }}>구독 중</p>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{active.length}개</p>
            </div>
            <div>
              <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 2px" }}>연간 예상</p>
              <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{formatPrice(monthly * 12)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 결제 예정 알림 (14일 이내) */}
      {upcomingBills.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 12px", color: "#1A1A2E" }}>
            곧 결제될 구독 🔔
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcomingBills.map(s => {
              const meta = getServiceMeta(s.title);
              return (
                <div key={s.title} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  background: "#fff", border: "1px solid #F0F0F0",
                  borderRadius: 14, padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: meta.bg,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                    }}>
                      {meta.icon}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: "#1A1A2E" }}>{s.title}</p>
                      <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
                        {s.days === 0 ? "오늘 결제" : `${s.days}일 후 (${formatNextDate(s.billing_date)})`}
                      </p>
                    </div>
                  </div>
                  <p style={{
                    fontWeight: 700, fontSize: 14, margin: 0,
                    color: s.days <= 3 ? "#E50914" : "#7F77DD",
                  }}>
                    {formatPrice(s.price)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 구독 미리보기 (최대 3개) */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "#1A1A2E" }}>내 구독 목록</h2>
          <button
            onClick={() => onNavigate("subscriptions")}
            style={{ fontSize: 13, color: "#7F77DD", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
          >
            전체 보기
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {active.slice(0, 3).map(s => {
            const meta = getServiceMeta(s.title);
            return (
              <div key={s.title} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "#fff", border: "1px solid #F0F0F0",
                borderRadius: 14, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: meta.bg,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20,
                  }}>
                    {meta.icon}
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 15, margin: 0, color: "#1A1A2E" }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
                      {formatBillingDay(s.billing_date)} 결제
                    </p>
                  </div>
                </div>
                <p style={{ fontWeight: 700, fontSize: 15, color: "#1A1A2E", margin: 0 }}>
                  {formatPrice(s.price)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
