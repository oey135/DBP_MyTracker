// ─────────────────────────────────────────────
// components/AuthPage.jsx
// 로그인 / 회원가입 화면 — 필드별 오류 표시
// ─────────────────────────────────────────────

import { useState } from "react";
import { login, register, setToken } from "../db/api";

// ── 서버 오류 메시지 → 필드 매핑 ─────────────
// 서버가 내려보내는 메시지를 보고 어떤 필드 오류인지 판별
function mapServerError(message) {
  if (!message) return { field: null, text: "알 수 없는 오류가 발생했습니다" };

  if (message === "duplicate_user_name")
    return { field: "user_name", text: "이미 사용 중인 사용자명입니다. 다른 사용자명을 입력해주세요" };

  if (message === "duplicate_email")
    return { field: "email", text: "이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해주세요" };

  if (message === "duplicate_unknown")
    return { field: null, text: "이미 사용 중인 사용자명 또는 이메일입니다" };

  if (message.includes("이메일 또는 비밀번호"))
    return { field: "both", text: "이메일 또는 비밀번호가 틀렸습니다. 다시 확인해주세요" };

  if (message.includes("서버") || message.includes("ECONNREFUSED") || message.includes("fetch"))
    return { field: null, text: "서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요" };

  return { field: null, text: message };
}

// ── 클라이언트 유효성 검사 ─────────────────────
function validate(mode, form) {
  // { field, text } 형태로 반환. 통과하면 null
  if (mode === "register") {
    if (!form.user_name.trim())
      return { field: "user_name", text: "사용자명을 입력하세요" };
    if (form.user_name.length > 20)
      return { field: "user_name", text: "사용자명은 20자 이하여야 합니다" };
    if (!/\S+@\S+\.\S+/.test(form.email))
      return { field: "email", text: "올바른 이메일 형식이 아닙니다" };
    if (form.password.length < 6)
      return { field: "password", text: "비밀번호는 6자 이상이어야 합니다" };
    if (form.password !== form.confirm)
      return { field: "confirm", text: "비밀번호가 일치하지 않습니다" };
  } else {
    if (!form.email)
      return { field: "email", text: "이메일을 입력하세요" };
    if (!form.password)
      return { field: "password", text: "비밀번호를 입력하세요" };
  }
  return null;
}

// ── 스타일 상수 ───────────────────────────────
const inputStyle = (hasError) => ({
  width: "100%", padding: "12px 16px", borderRadius: 14,
  border: `1.5px solid ${hasError ? "#E50914" : "#E8E8E8"}`,
  fontSize: 15, outline: "none", boxSizing: "border-box",
  background: hasError ? "#FFF8F8" : "#fff", color: "#1A1A2E",
  fontFamily: "inherit", transition: "border-color 0.15s",
});

const BTN_PRIMARY = (loading) => ({
  width: "100%", padding: "14px", background: "#7F77DD", color: "#fff",
  border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700,
  cursor: loading ? "not-allowed" : "pointer",
  fontFamily: "inherit", opacity: loading ? 0.7 : 1,
});

const BTN_GHOST = {
  background: "none", border: "none", color: "#7F77DD",
  fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0,
};

// ── 필드 오류 메시지 컴포넌트 ─────────────────
function FieldError({ text }) {
  if (!text) return null;
  return (
    <p style={{ fontSize: 12, color: "#E50914", margin: "5px 0 0 4px" }}>
      ⚠ {text}
    </p>
  );
}

// ── 전체 오류 배너 (서버 오류 등) ─────────────
function ErrorBanner({ text }) {
  if (!text) return null;
  return (
    <div style={{
      background: "#FFF0F0", border: "1px solid #FFCDD2",
      borderRadius: 12, padding: "12px 14px",
      display: "flex", alignItems: "flex-start", gap: 8,
    }}>
      <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
      <p style={{ fontSize: 13, color: "#C62828", margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────
export default function AuthPage({ onAuth }) {
  const [mode,    setMode]    = useState("login");
  const [form,    setForm]    = useState({ user_name: "", email: "", password: "", confirm: "" });
  const [errors,  setErrors]  = useState({});   // { field: message }
  const [banner,  setBanner]  = useState("");    // 전체 오류 배너
  const [loading, setLoading] = useState(false);

  const setField = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    // 해당 필드 오류 즉시 제거
    setErrors(p => ({ ...p, [k]: "" }));
    setBanner("");
  };

  const switchMode = (next) => {
    setMode(next);
    setForm({ user_name: "", email: "", password: "", confirm: "" });
    setErrors({});
    setBanner("");
  };

  const handleSubmit = async () => {
    // 클라이언트 유효성 검사
    const clientErr = validate(mode, form);
    if (clientErr) {
      setErrors({ [clientErr.field]: clientErr.text });
      return;
    }

    setLoading(true);
    setErrors({});
    setBanner("");

    try {
      const data = mode === "login"
        ? await login(form.email, form.password)
        : await register(form.user_name, form.email, form.password);

      setToken(data.token);
      onAuth(data);
    } catch (err) {
      const { field, text } = mapServerError(err.message);

      if (field === "both") {
        // 로그인 실패: 두 필드 모두 강조
        setErrors({ email: " ", password: " " });
        setBanner(text);
      } else if (field) {
        setErrors({ [field]: text });
      } else {
        setBanner(text);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div style={{
      maxWidth: 390, margin: "0 auto", minHeight: "100vh",
      background: "#FAFAFA", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      fontFamily: "-apple-system, 'Pretendard', sans-serif",
      padding: "0 28px",
    }}>

      {/* 로고 */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20, margin: "0 auto 14px",
          background: "linear-gradient(135deg, #7F77DD, #534AB7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 32,
        }}>📋</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px", color: "#1A1A2E" }}>MyTracker</h1>
        <p style={{ fontSize: 14, color: "#aaa", margin: 0 }}>구독을 한눈에 관리하세요</p>
      </div>

      {/* 탭 전환 */}
      <div style={{
        display: "flex", width: "100%", background: "#F0F0F0",
        borderRadius: 14, padding: 4, marginBottom: 20, boxSizing: "border-box",
      }}>
        {[["login", "로그인"], ["register", "회원가입"]].map(([val, label]) => (
          <button key={val} onClick={() => switchMode(val)} style={{
            flex: 1, padding: "10px", borderRadius: 10, fontSize: 14,
            fontWeight: mode === val ? 700 : 500, cursor: "pointer",
            border: "none", transition: "all 0.15s", fontFamily: "inherit",
            background: mode === val ? "#fff" : "transparent",
            color: mode === val ? "#7F77DD" : "#999",
            boxShadow: mode === val ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* 폼 */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 전체 오류 배너 */}
        <ErrorBanner text={banner} />

        {/* 사용자명 (회원가입만) */}
        {mode === "register" && (
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>사용자명</label>
            <input
              style={inputStyle(!!errors.user_name)}
              placeholder="예: jiyeon (20자 이하)"
              value={form.user_name}
              onChange={e => setField("user_name", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <FieldError text={errors.user_name} />
          </div>
        )}

        {/* 이메일 */}
        <div>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>이메일</label>
          <input
            style={inputStyle(!!errors.email)}
            type="email"
            placeholder="example@email.com"
            value={form.email}
            onChange={e => setField("email", e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <FieldError text={errors.email?.trim() ? errors.email : ""} />
        </div>

        {/* 비밀번호 */}
        <div>
          <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>비밀번호</label>
          <input
            style={inputStyle(!!errors.password)}
            type="password"
            placeholder={mode === "register" ? "6자 이상" : "비밀번호 입력"}
            value={form.password}
            onChange={e => setField("password", e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <FieldError text={errors.password?.trim() ? errors.password : ""} />
        </div>

        {/* 비밀번호 확인 (회원가입만) */}
        {mode === "register" && (
          <div>
            <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>비밀번호 확인</label>
            <input
              style={inputStyle(!!errors.confirm)}
              type="password"
              placeholder="비밀번호 재입력"
              value={form.confirm}
              onChange={e => setField("confirm", e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <FieldError text={errors.confirm} />
          </div>
        )}

        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ ...BTN_PRIMARY(loading), marginTop: 2 }}
        >
          {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
        </button>
      </div>

      {/* 전환 링크 */}
      <p style={{ fontSize: 13, color: "#aaa", marginTop: 24 }}>
        {mode === "login" ? "계정이 없으신가요? " : "이미 계정이 있으신가요? "}
        <button onClick={() => switchMode(mode === "login" ? "register" : "login")} style={BTN_GHOST}>
          {mode === "login" ? "회원가입" : "로그인"}
        </button>
      </p>
    </div>
  );
}
