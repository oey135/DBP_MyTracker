// ─────────────────────────────────────────────
// App.jsx  (루트 컴포넌트)
// 인증 상태에 따라 AuthPage ↔ 메인 앱 전환
// ─────────────────────────────────────────────

import { useState, useEffect } from "react";

import {
  getMySubscriptions,
  addSubscription,
  updateSubscription,
  deleteSubscription,
  getToken,
  clearToken,
} from "./db/api";

import AuthPage         from "./components/AuthPage";
import BottomNav        from "./components/BottomNav";
import SubModal         from "./components/SubModal";
import ConfirmModal, { useConfirm } from "./components/ConfirmModal";
import HomeTab          from "./components/HomeTab";
import SubscriptionsTab from "./components/SubscriptionsTab";
import StatsTab         from "./components/StatsTab";
import CalendarTab      from "./components/CalendarTab";
import FriendsTab       from "./components/FriendsTab";
import ProfileTab       from "./components/ProfileTab";

export default function App() {
  // ── 인증 상태 ─────────────────────────────
  const [user,        setUser]        = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]));
        if (payload.exp * 1000 > Date.now()) {
          setUser({ uid: payload.uid, user_name: payload.user_name, token });
        } else {
          clearToken();
        }
      } catch {
        clearToken();
      }
    }
    setAuthChecked(true);
  }, []);

  const handleAuth = (data) => {
    setUser(data);
    setTab("home"); // 로그인 후 항상 홈으로
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setTab("home");
    setSubscriptions([]);
  };

  const handleWithdraw = () => {
    clearToken();
    setUser(null);
    setTab("home");
    setSubscriptions([]);
  };

  // ── 확인 모달 ─────────────────────────────
  const { confirm, confirmModal } = useConfirm();
  // 단순 안내 메시지 (확인 버튼만 의미 있음)
  const notify = (message) => confirm({ message, confirmText: "확인" });

  // ── 메인 앱 상태 ──────────────────────────
  const [tab,           setTab]           = useState("home");
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [subModal,      setSubModal]      = useState(null);

  const refresh = async () => {
    try {
      const data = await getMySubscriptions();
      setSubscriptions(data);
    } catch (err) {
      console.error("구독 목록 조회 실패:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [user]);

  // ── 구독 CRUD 핸들러 ──────────────────────
  const handleAdd = () => setSubModal({ type: "add" });
  const handleEdit = (sub) => setSubModal({ type: "edit", data: sub });

  const handleDelete = async (sub) => {
    const ok = await confirm({
      message: `"${sub.title}" 구독을 삭제하시겠습니까?\n결제 기록이 있는 구독은 기록 보존을 위해 해지로 처리됩니다.`,
      confirmText: "삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await deleteSubscription(sub.sub_id);
      await refresh();
      if (res?.result === "cancelled")
        await notify("결제 기록이 있어 삭제 대신 해지로 처리했습니다.");
    } catch (err) { await notify(err.message); }
  };

  // 복구: 서버가 start_date를 오늘(KST)로, end_date를 비움
  const handleRestore = async (sub) => {
    try {
      await updateSubscription(sub.sub_id, { status: "subscribed" });
      await refresh();
    } catch (err) { await notify(err.message); }
  };

  // 실패하면 예외가 SubModal로 전달되어 모달 안에 오류 메시지를 표시
  const handleSave = async (data) => {
    if (subModal.type === "add") {
      await addSubscription(data);
    } else {
      await updateSubscription(subModal.data.sub_id, data);
    }
    await refresh();
    setSubModal(null);
  };

  // ── 렌더링 ────────────────────────────────
  if (!authChecked) return null;
  if (!user) return <AuthPage onAuth={handleAuth} />;

  if (loading) {
    return (
      <div style={{
        maxWidth: 390, margin: "0 auto", height: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "-apple-system, 'Pretendard', sans-serif",
        color: "#7F77DD", fontSize: 14,
      }}>
        불러오는 중...
      </div>
    );
  }

  // 중복 검사용: 구독 중인 서비스 이름 (수정 중인 구독은 제외)
  const existingTitles = subscriptions
    .filter(s => s.role !== "member" && s.status === "subscribed" && s.sub_id !== subModal?.data?.sub_id)
    .map(s => s.title);

  return (
    <div style={{
      maxWidth: 390, margin: "0 auto", minHeight: "100vh",
      background: "#FAFAFA", display: "flex", flexDirection: "column",
      fontFamily: "-apple-system, 'Pretendard', sans-serif",
    }}>
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 88 }}>
        {tab === "home"          && <HomeTab          subscriptions={subscriptions} onNavigate={setTab} />}
        {tab === "subscriptions" && <SubscriptionsTab subscriptions={subscriptions} onAdd={handleAdd} onEdit={handleEdit} onDelete={handleDelete} onRestore={handleRestore} myUid={user.uid} onChanged={refresh} />}
        {tab === "calendar"      && <CalendarTab      subscriptions={subscriptions} />}
        {tab === "stats"         && <StatsTab         subscriptions={subscriptions} />}
        {tab === "friends"       && <FriendsTab       confirm={confirm} />}
        {tab === "profile"       && <ProfileTab       subscriptions={subscriptions} confirm={confirm} onLogout={handleLogout} onWithdraw={handleWithdraw} />}
      </div>

      <BottomNav tab={tab} setTab={setTab} />

      {/* 구독 추가/수정 모달 */}
      {subModal && (
        <SubModal
          initial={subModal.type === "edit" ? subModal.data : null}
          existingTitles={existingTitles}
          onSave={handleSave}
          onClose={() => setSubModal(null)}
        />
      )}

      {/* 전역 확인 모달 */}
      <ConfirmModal {...confirmModal} />
    </div>
  );
}
