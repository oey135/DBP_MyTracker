// ─────────────────────────────────────────────
// components/SubModal.jsx
// 구독 추가 / 수정 바텀시트 모달
// DayPicker (매월 결제일 선택 UI) 포함
// ServiceAutocomplete (서비스명 자동완성) 포함
// ─────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { getBillingDay } from "../utils/subscriptionUtils";
import { CURRENT_UID } from "../constants/serviceMeta";
import popularServices from "../constants/popularServices.json";

// ── DayPicker ────────────────────────────────
function DayPicker({ value, onChange }) {
  const selected = value ? getBillingDay(value) : null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(`2000-01-${String(d).padStart(2, "0")}`)}
          style={{
            width: 38, height: 38, borderRadius: 10,
            fontSize: 13, fontWeight: 500, cursor: "pointer", flexShrink: 0,
            border: selected === d ? "none" : "1px solid #E8E8E8",
            background: selected === d ? "#7F77DD" : "#F9F9F9",
            color: selected === d ? "#fff" : "#333",
          }}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

// ── ServiceAutocomplete ───────────────────────
// 서비스명 입력 시 popularServices.json에서 자동완성 목록 표시
function ServiceAutocomplete({ value, onChange, onSelect }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const q = value.trim().toLowerCase();
  const suggestions = q.length > 0
    ? popularServices.filter(s => {
        const titleMatch  = s.title.toLowerCase().includes(q);
        const titleKoMatch = (s.titleKo ?? "").toLowerCase().includes(q);
        const exactMatch  = s.title.toLowerCase() === q || (s.titleKo ?? "").toLowerCase() === q;
        return (titleMatch || titleKoMatch) && !exactMatch;
      }).slice(0, 6)
    : [];

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (service) => {
    onSelect(service);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="예: Netflix 또는 넷플릭스"
        style={{
          width: "100%", padding: "10px 14px", borderRadius: 12,
          border: "1.5px solid #E8E8E8", fontSize: 15, outline: "none",
          boxSizing: "border-box", background: "#fff", color: "#1A1A2E",
          fontFamily: "inherit",
        }}
      />

      {/* 자동완성 드롭다운 */}
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "#fff", borderRadius: 12, zIndex: 100,
          border: "1.5px solid #E8E8E8",
          boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
          overflow: "hidden",
        }}>
          {suggestions.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onMouseDown={() => handleSelect(s)}
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between", padding: "10px 14px",
                background: "none", border: "none", cursor: "pointer",
                textAlign: "left", fontFamily: "inherit",
                borderTop: i > 0 ? "1px solid #F5F5F5" : "none",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#F8F7FF"}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <div>
                <span style={{ fontSize: 14, color: "#1A1A2E", fontWeight: 500 }}>{s.title}</span>
                {s.titleKo && s.titleKo !== s.title && (
                  <span style={{ fontSize: 12, color: "#aaa", marginLeft: 6 }}>{s.titleKo}</span>
                )}
              </div>
              <span style={{ fontSize: 12, color: "#aaa", flexShrink: 0 }}>
                {s.price.toLocaleString("ko-KR")}원
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── SubModal ─────────────────────────────────
const EMPTY_FORM = {
  title: "", price: "", start_date: "", billing_date: "", memo: "", status: "subscribed",
};

const NON_TITLE_FIELDS = [
  { label: "월 금액 (원)", key: "price",      type: "number", placeholder: "예: 17000"  },
  { label: "시작일",       key: "start_date", type: "date",   placeholder: ""           },
  { label: "메모",         key: "memo",       type: "text",   placeholder: "선택 사항"  },
];

export default function SubModal({ initial, existingTitles, onSave, onClose }) {
  const isEdit = !!initial;
  const [form,  setForm]  = useState(
    initial ? { ...initial, price: String(initial.price) } : EMPTY_FORM
  );
  const [error, setError] = useState("");

  const set = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v };
    if (k === "start_date" && v) {
      const day = v.split("-")[2];
      const newBillingDate = `2000-01-${day}`;
      const prevDay        = prev.start_date   ? prev.start_date.split("-")[2]   : null;
      const prevBillingDay = prev.billing_date ? prev.billing_date.split("-")[2] : null;
      if (!prev.billing_date || prevDay === prevBillingDay) {
        next.billing_date = newBillingDate;
      }
    }
    return next;
  });

  // 자동완성 항목 선택 시 title + price 한 번에 채움
  const handleServiceSelect = (service) => {
    setForm(prev => ({
      ...prev,
      title: service.title,
      price: String(service.price),
    }));
    setError("");
  };

  const handleSave = () => {
    if (!form.title.trim())
      return setError("서비스명을 입력하세요");
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0)
      return setError("올바른 금액을 입력하세요");
    if (!form.billing_date)
      return setError("결제일(매월 몇 일)을 선택하세요");
    if (!isEdit && existingTitles.includes(form.title.trim()))
      return setError("이미 등록된 서비스입니다");

    onSave({ ...form, price: Number(form.price), uid: CURRENT_UID });
  };

  const selectedDay = form.billing_date ? getBillingDay(form.billing_date) : null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 999,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "#fff", borderRadius: "24px 24px 0 0",
        padding: "24px 20px 32px", width: "100%", maxWidth: 420,
        maxHeight: "85vh", overflowY: "auto",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            {isEdit ? "구독 수정" : "구독 추가"}
          </h2>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}
          >✕</button>
        </div>

        {/* 서비스명 (자동완성) */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
            서비스명
          </label>
          <ServiceAutocomplete
            value={form.title}
            onChange={v => { set("title", v); setError(""); }}
            onSelect={handleServiceSelect}
          />
          <p style={{ fontSize: 11, color: "#bbb", margin: "5px 0 0 2px" }}>
            서비스명 또는 한국어로 검색하면 자동완성됩니다
          </p>
        </div>

        {/* 나머지 텍스트 필드 */}
        {NON_TITLE_FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 12,
                border: "1.5px solid #E8E8E8", fontSize: 15, outline: "none",
                boxSizing: "border-box", background: "#fff", color: "#1A1A2E",
                fontFamily: "inherit",
              }}
            />
          </div>
        ))}

        {/* 매월 결제일 선택 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <label style={{ fontSize: 13, color: "#666" }}>매월 결제일</label>
            {selectedDay && (
              <span style={{
                fontSize: 13, fontWeight: 700, color: "#7F77DD",
                background: "#F0EFFE", padding: "3px 10px", borderRadius: 20,
              }}>
                매월 {selectedDay}일
              </span>
            )}
          </div>
          <DayPicker value={form.billing_date} onChange={v => set("billing_date", v)} />
          <p style={{ fontSize: 11, color: "#bbb", margin: "8px 0 0" }}>
            29~31일은 해당 월에 없으면 말일에 결제됩니다
          </p>
        </div>

        {/* 상태 토글 */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>상태</label>
          <div style={{ display: "flex", gap: 8 }}>
            {[["subscribed", "구독 중"], ["cancelled", "취소됨"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => set("status", val)}
                style={{
                  flex: 1, padding: "10px", borderRadius: 12, fontSize: 14, cursor: "pointer",
                  background: form.status === val ? "#7F77DD" : "#F5F5F5",
                  color:      form.status === val ? "#fff"    : "#666",
                  border: "none", fontWeight: form.status === val ? 600 : 400,
                  fontFamily: "inherit",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p style={{ color: "#E50914", fontSize: 13, textAlign: "center", margin: "0 0 12px" }}>
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          style={{
            width: "100%", padding: "14px", background: "#7F77DD", color: "#fff",
            border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
