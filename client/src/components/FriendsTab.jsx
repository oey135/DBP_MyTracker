// ─────────────────────────────────────────────
// components/FriendsTab.jsx
// 친구 탭 — 친구 추가 / 요청 수락·거절 / 친구 구독 조회
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import {
  getFriends,
  sendFriendRequest,
  respondFriendRequest,
  cancelFriendRequest,
  removeFriend,
  getFriendSubscriptions,
} from "../db/api";
import { formatPrice } from "../utils/subscriptionUtils";
import { getServiceMeta, CURRENT_UID } from "../constants/serviceMeta";

export default function FriendsTab({ confirm }) {
  const [friends,    setFriends]    = useState([]);
  const [addInput,   setAddInput]   = useState("");
  const [addMsg,     setAddMsg]     = useState({ text: "", ok: true });
  const [expanded,   setExpanded]   = useState(null);
  const [friendSubs, setFriendSubs] = useState({});

  const loadFriends = useCallback(async () => {
    try {
      const data = await getFriends(CURRENT_UID);
      setFriends(data);
    } catch (err) {
      console.error("친구 목록 조회 실패:", err);
    }
  }, []);

  useEffect(() => { loadFriends(); }, [loadFriends]);

  const handleAdd = async () => {
    if (!addInput.trim()) return;
    try {
      await sendFriendRequest(CURRENT_UID, addInput.trim());
      setAddMsg({ text: "친구 요청을 보냈습니다 ✓", ok: true });
      setAddInput("");
      loadFriends();
    } catch (err) {
      setAddMsg({ text: err.message, ok: false });
    }
    setTimeout(() => setAddMsg({ text: "", ok: true }), 3000);
  };

  const handleRespond = async (senderUid, action) => {
    try {
      await respondFriendRequest(senderUid, CURRENT_UID, action);
      loadFriends();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = async (receiverUid, receiverName) => {
    const ok = await confirm({
      message: `@${receiverName}에게 보낸\n친구 요청을 취소하시겠습니까?`,
      confirmText: "요청 취소",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelFriendRequest(receiverUid);
      loadFriends();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemove = async (friendUid, friendName) => {
    const ok = await confirm({
      message: `@${friendName}을(를)\n친구 목록에서 삭제하시겠습니까?`,
      confirmText: "친구 삭제",
      danger: true,
    });
    if (!ok) return;
    try {
      await removeFriend(friendUid);
      setExpanded(null);
      setFriendSubs(prev => { const next = { ...prev }; delete next[friendUid]; return next; });
      loadFriends();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleExpand = async (uid) => {
    if (expanded === uid) return setExpanded(null);
    setExpanded(uid);
    if (!friendSubs[uid]) {
      try {
        const subs = await getFriendSubscriptions(uid);
        setFriendSubs(prev => ({ ...prev, [uid]: subs }));
      } catch (err) {
        console.error("친구 구독 조회 실패:", err);
      }
    }
  };

  const accepted = friends.filter(f => f.status === "accepted");
  const pending  = friends.filter(f => f.status === "pending" && !f.isSender);
  const sent     = friends.filter(f => f.status === "pending" &&  f.isSender);

  return (
    <div style={{ padding: "20px 20px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 20px", color: "#1A1A2E" }}>친구</h1>

      {/* 친구 추가 */}
      <div style={{ background: "#F8F7FF", borderRadius: 16, padding: "14px 16px", marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: "#7F77DD", fontWeight: 600, margin: "0 0 10px" }}>친구 추가</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={addInput}
            onChange={e => setAddInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="사용자명 입력"
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 12,
              border: "1.5px solid #DDD", fontSize: 14, outline: "none", boxSizing: "border-box",
            }}
          />
          <button onClick={handleAdd} style={{
            padding: "10px 16px", background: "#7F77DD", color: "#fff",
            border: "none", borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>요청</button>
        </div>
        {addMsg.text && (
          <p style={{ fontSize: 13, color: addMsg.ok ? "#1DB954" : "#E50914", margin: "8px 0 0" }}>
            {addMsg.text}
          </p>
        )}
      </div>

      {/* 받은 요청 */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E", margin: "0 0 10px" }}>
            받은 요청 ({pending.length})
          </p>
          {pending.map(f => (
            <div key={f.uid} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 8, background: "#fff", border: "1px solid #F0F0F0",
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <UserAvatar name={f.user_name} />
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#1A1A2E" }}>@{f.user_name}</p>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => handleRespond(f.uid, "accept")} style={{ padding: "6px 12px", background: "#7F77DD", color: "#fff", border: "none", borderRadius: 10, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>수락</button>
                <button onClick={() => handleRespond(f.uid, "reject")} style={{ padding: "6px 12px", background: "#F5F5F5", color: "#888", border: "none", borderRadius: 10, fontSize: 12, cursor: "pointer" }}>거절</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 보낸 요청 */}
      {sent.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E", margin: "0 0 10px" }}>보낸 요청</p>
          {sent.map(f => (
            <div key={f.uid} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 8, background: "#fff", border: "1px solid #F0F0F0",
              borderRadius: 14, padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <UserAvatar name={f.user_name} muted />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#aaa" }}>@{f.user_name}</p>
                  <p style={{ fontSize: 11, color: "#bbb", margin: "2px 0 0" }}>수락 대기 중</p>
                </div>
              </div>
              <button
                onClick={() => handleCancel(f.uid, f.user_name)}
                style={{
                  padding: "6px 12px", background: "#FFF0F0", color: "#E50914",
                  border: "none", borderRadius: 10, fontSize: 12,
                  cursor: "pointer", fontWeight: 600, flexShrink: 0,
                }}
              >
                취소
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 친구 목록 */}
      <div>
        <p style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E", margin: "0 0 10px" }}>
          친구 목록 ({accepted.length})
        </p>
        {accepted.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#ccc" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
            <p style={{ fontSize: 14 }}>친구가 없습니다</p>
          </div>
        ) : accepted.map(f => {
          const subs   = friendSubs[f.uid] || [];
          const isOpen = expanded === f.uid;
          const fTotal = subs.reduce((sum, s) => sum + s.price, 0);
          return (
            <div key={f.uid} style={{ background: "#fff", border: "1px solid #F0F0F0", borderRadius: 16, marginBottom: 10, overflow: "hidden" }}>
              <button onClick={() => toggleExpand(f.uid)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <UserAvatar name={f.user_name} size={42} />
                  <div>
                    <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "#1A1A2E" }}>@{f.user_name}</p>
                  </div>
                </div>
                <span style={{ fontSize: 18, color: "#ccc", transform: isOpen ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
              </button>
              {isOpen && (
                <div style={{ padding: "0 16px 14px", borderTop: "1px solid #F8F8F8" }}>
                  <p style={{ fontSize: 12, color: "#aaa", margin: "10px 0 8px" }}>월 {formatPrice(fTotal)} 구독 중</p>
                  {subs.length === 0 ? (
                    <p style={{ fontSize: 13, color: "#ccc", margin: "0 0 12px" }}>구독 중인 서비스가 없습니다</p>
                  ) : subs.map(s => {
                    const meta = getServiceMeta(s.title);
                    return (
                      <div key={s.title} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{meta.icon}</span>
                          <span style={{ fontSize: 14, color: "#333" }}>{s.title}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#534AB7" }}>{formatPrice(s.price)}</span>
                      </div>
                    );
                  })}
                  <div style={{ borderTop: "1px solid #F5F5F5", paddingTop: 10, marginTop: 4 }}>
                    <button
                      onClick={() => handleRemove(f.uid, f.user_name)}
                      style={{
                        width: "100%", padding: "8px", background: "#FFF0F0",
                        color: "#E50914", border: "none", borderRadius: 10,
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      친구 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UserAvatar({ name, size = 38, muted = false }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: muted ? "#F5F5F5" : "#E8E6FF",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.round(size * 0.42), fontWeight: 700,
      color: muted ? "#aaa" : "#7F77DD", flexShrink: 0,
    }}>
      {name[0].toUpperCase()}
    </div>
  );
}
