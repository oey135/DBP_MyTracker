// ─────────────────────────────────────────────
// components/SubModal.jsx
// 구독 추가 / 수정 바텀시트 모달
// DayPicker (매월 결제일 선택 UI) 포함
// ─────────────────────────────────────────────

import { useState } from "react";
import { getBillingDay } from "../utils/subscriptionUtils";
import { CURRENT_UID } from "../constants/serviceMeta";

// ── DayPicker ────────────────────────────────
// billing_date를 "2000-01-DD" 형태로 저장하기 위해
// 1~31 버튼 그리드로 일(day)만 선택받음
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

// ── SubModal ─────────────────────────────────
const EMPTY_FORM = {
  title: "", price: "", start_date: "", billing_date: "", memo: "", status: "subscribed",
};

const TEXT_FIELDS = [
  { label: "서비스명",    key: "title",      type: "text",   placeholder: "예: Netflix", disabledOnEdit: true },
  { label: "월 금액 (원)", key: "price",     type: "number", placeholder: "예: 17000"  },
  { label: "시작일",      key: "start_date", type: "date",   placeholder: ""            },
  { label: "메모",        key: "memo",       type: "text",   placeholder: "선택 사항"   },
];

export default function SubModal({ initial, existingTitles, onSave, onClose }) {
  const isEdit = !!initial;
  const [form, setForm] = useState(
    initial ? { ...initial, price: String(initial.price) } : EMPTY_FORM
  );
  const [error, setError] = useState("");

  const set = (k, v) => setForm(prev => {
    const next = { ...prev, [k]: v };
    // 시작일 변경 시, 결제일이 아직 선택 안 됐거나 이전 시작일과 같았으면 자동 동기화
    if (k === "start_date" && v) {
      const day = v.split("-")[2]; // "2024-03-15" → "15"
      const newBillingDate = `2000-01-${day}`;
      const prevDay = prev.start_date ? prev.start_date.split("-")[2] : null;
      const prevBillingDay = prev.billing_date ? prev.billing_date.split("-")[2] : null;
      // 결제일이 없거나, 이전 시작일과 결제일이 같았던 경우에만 자동 설정
      if (!prev.billing_date || prevDay === prevBillingDay) {
        next.billing_date = newBillingDate;
      }
    }
    return next;
  });

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

        {/* 텍스트 입력 필드들 */}
        {TEXT_FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
              {f.label}
            </label>
            <input
              type={f.type}
              value={form[f.key]}
              onChange={e => set(f.key, e.target.value)}
              placeholder={f.placeholder}
              disabled={isEdit && f.disabledOnEdit}
              style={{
                width: "100%", padding: "10px 14px", borderRadius: 12,
                border: "1.5px solid #E8E8E8", fontSize: 15, outline: "none",
                boxSizing: "border-box",
                background: (isEdit && f.disabledOnEdit) ? "#F8F8F8" : "#fff",
                color:      (isEdit && f.disabledOnEdit) ? "#aaa"    : "#1A1A2E",
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
            border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer",
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
}
