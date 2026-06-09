// ─────────────────────────────────────────────
// components/ConfirmModal.jsx
// 범용 확인 모달 — window.confirm 대체
//
// 사용법 (App.jsx에서 전역 관리):
//   const { confirmModal, confirm } = useConfirm();
//   ...
//   await confirm({ message: "삭제하시겠습니까?", confirmText: "삭제", danger: true });
//   ...
//   <ConfirmModal {...confirmModal} />
// ─────────────────────────────────────────────

import { useState, useCallback } from "react";

// ── useConfirm 훅 ─────────────────────────────
// confirm()은 Promise를 반환 — true(확인) / false(취소)
export function useConfirm() {
  const [state, setState] = useState(null);
  // state: null | { message, confirmText, danger, resolve }

  const confirm = useCallback(({ message, confirmText = "확인", cancelText = "취소", danger = false }) => {
    return new Promise((resolve) => {
      setState({ message, confirmText, cancelText, danger, resolve });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  return {
    confirm,
    confirmModal: state
      ? { ...state, onConfirm: handleConfirm, onCancel: handleCancel }
      : null,
  };
}

// ── ConfirmModal 컴포넌트 ─────────────────────
export default function ConfirmModal({ message, confirmText, cancelText, danger, onConfirm, onCancel }) {
  if (!message) return null;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 20,
          padding: "28px 24px 24px",
          width: "calc(100% - 80px)", maxWidth: 330,
          fontFamily: "-apple-system, 'Pretendard', sans-serif",
        }}
      >
        {/* 메시지 */}
        <p style={{
          fontSize: 16, fontWeight: 600, color: "#1A1A2E",
          textAlign: "center", margin: "0 0 24px", lineHeight: 1.6,
          whiteSpace: "pre-line",
        }}>
          {message}
        </p>

        {/* 버튼 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: "13px", borderRadius: 14, fontSize: 15,
              fontWeight: 600, cursor: "pointer", border: "1.5px solid #E8E8E8",
              background: "#F8F8F8", color: "#666", fontFamily: "inherit",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: "13px", borderRadius: 14, fontSize: 15,
              fontWeight: 700, cursor: "pointer", border: "none",
              background: danger ? "#E50914" : "#7F77DD",
              color: "#fff", fontFamily: "inherit",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
