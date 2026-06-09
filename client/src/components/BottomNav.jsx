// ─────────────────────────────────────────────
// components/BottomNav.jsx
// ─────────────────────────────────────────────

const TABS = [
  { id: "home",          icon: "🏠", label: "홈"     },
  { id: "subscriptions", icon: "📋", label: "구독"   },
  { id: "calendar",      icon: "📅", label: "캘린더" },
  { id: "friends",       icon: "👥", label: "친구"   },
  { id: "profile",       icon: "👤", label: "내 정보" },
];

export default function BottomNav({ tab, setTab }) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 390,
      background: "#fff", borderTop: "1px solid #F0F0F0",
      display: "flex", justifyContent: "space-around",
      padding: "8px 0 20px", zIndex: 100,
    }}>
      {TABS.map(item => (
        <button
          key={item.id}
          onClick={() => setTab(item.id)}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            background: "none", border: "none", cursor: "pointer", padding: "4px 12px",
            opacity: tab === item.id ? 1 : 0.4, transition: "opacity 0.15s",
          }}
        >
          <span style={{ fontSize: 22 }}>{item.icon}</span>
          <span style={{
            fontSize: 11,
            color: tab === item.id ? "#7F77DD" : "#888",
            fontWeight: tab === item.id ? 600 : 400,
          }}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}
