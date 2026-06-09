// ─────────────────────────────────────────────
// components/ProfileTab.jsx
// 내 정보 탭 — 프로필 + 구독 통계 + 지출 순위 + 로그아웃
// ─────────────────────────────────────────────

import { useState, useEffect } from "react";
import { formatPrice } from "../utils/subscriptionUtils";
import { getServiceMeta } from "../constants/serviceMeta";
import { getUserById } from "../db/api";

export default function ProfileTab({ subscriptions, confirm, onLogout }) {
  const [me, setMe] = useState(null);

  useEffect(() => {
    getUserById()
      .then(setMe)
      .catch(err => console.error("프로필 조회 실패:", err));
  }, []);

  if (!me) return (
    <div style={{ padding: "20px", textAlign: "center", color: "#aaa", fontSize: 14 }}>
      불러오는 중...
    </div>
  );

  const active  = subscriptions.filter(s => s.status === "subscribed");
  const monthly = active.reduce((sum, s) => sum + s.price, 0);
  const byPrice = [...active].sort((a, b) => b.price - a.price).slice(0, 5);

  const stats = [
    { label: "구독 중",   value: `${active.length}개`,    icon: "📋" },
    { label: "월 지출",   value: formatPrice(monthly),         icon: "💳" },
    { label: "연간 예상", value: formatPrice(monthly * 12),    icon: "📅" },
  ];

  const handleLogout = async () => {
    const ok = await confirm({
      message: "로그아웃 하시겠습니까?",
      confirmText: "로그아웃",
      danger: false,
    });
    if (ok) onLogout();
  };

  return (
    <div style={{ padding: "20px 20px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 20px", color: "#1A1A2E" }}>내 정보</h1>

      {/* 프로필 카드 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 24,
        background: "#fff", border: "1px solid #F0F0F0", borderRadius: 18, padding: "18px 16px",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "linear-gradient(135deg, #7F77DD, #534AB7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 24, fontWeight: 700, color: "#fff", flexShrink: 0,
        }}>
          {me.user_name[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: "0 0 3px", color: "#1A1A2E" }}>@{me.user_name}</p>
          <p style={{ fontSize: 13, color: "#aaa", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.email}</p>
        </div>
      </div>

      {/* 통계 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {stats.map(c => (
          <div key={c.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#F8F7FF", borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{c.icon}</span>
              <span style={{ fontSize: 14, color: "#666" }}>{c.label}</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#534AB7" }}>{c.value}</span>
          </div>
        ))}
      </div>

      {/* 지출 순위 */}
      {byPrice.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 15, fontWeight: 600, margin: "0 0 12px", color: "#1A1A2E" }}>💸 지출 순위</p>
          {byPrice.map((s, i) => {
            const meta = getServiceMeta(s.title);
            const pct  = Math.round((s.price / monthly) * 100);
            return (
              <div key={s.title} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#aaa", fontWeight: 600, minWidth: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 15 }}>{meta.icon}</span>
                    <span style={{ fontSize: 14, color: "#1A1A2E" }}>{s.title}</span>
                  </div>
                  <span style={{ fontSize: 13, color: "#534AB7", fontWeight: 600 }}>{formatPrice(s.price)}</span>
                </div>
                <div style={{ background: "#F0F0F0", borderRadius: 4, height: 6, overflow: "hidden" }}>
                  <div style={{ background: "#7F77DD", height: "100%", width: `${pct}%`, borderRadius: 4, transition: "width 0.5s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 로그아웃 버튼 */}
      <button onClick={handleLogout} style={{
        width: "100%", padding: "14px", background: "#fff",
        color: "#E50914", border: "1.5px solid #FFE0E0", borderRadius: 14,
        fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
      }}>
        로그아웃
      </button>
    </div>
  );
}
