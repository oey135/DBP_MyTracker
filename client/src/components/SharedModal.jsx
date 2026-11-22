// ─────────────────────────────────────────────
// components/SharedModal.jsx
// 공유 구독 관리 모달 (기획서 4)
//
// 소유자 : 친구 초대·내보내기, 분담 방식(균등/지정 금액), 이번 회차 정산 체크
// 참여자 : 참여자·분담액 보기, 내 정산 상태 확인, 나가기
// ─────────────────────────────────────────────

import { useEffect, useState, useCallback } from "react";
import {
    getShared,
    getFriends,
    inviteToShared,
    removeSharedMember,
    updateSharedSplit,
    getSettlements,
    setSettlement,
} from "../db/api";
import { formatPrice } from "../utils/subscriptionUtils";

const C = { ink: "#1A1A2E", sub: "#666", muted: "#999", brand: "#7F77DD", dark: "#534AB7" };
const section = { marginBottom: 20 };
const label = { fontSize: 13, color: C.sub, fontWeight: 600, margin: "0 0 8px" };
const pill = (on) => ({
    flex: 1,
    padding: "9px",
    borderRadius: 12,
    fontSize: 13,
    cursor: "pointer",
    border: "none",
    fontFamily: "inherit",
    background: on ? C.brand : "#F5F5F5",
    color: on ? "#fff" : C.sub,
    fontWeight: on ? 600 : 400,
});
const smallBtn = (bg, color) => ({
    fontSize: 11,
    padding: "4px 10px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    background: bg,
    color,
    fontWeight: 600,
    fontFamily: "inherit",
    whiteSpace: "nowrap",
});

const thisYm = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const shiftYm = (ym, n) => {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function SharedModal({ subId, myUid, onClose, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [friends, setFriends] = useState([]);
    const [ym, setYm] = useState(thisYm());
    const [settle, setSettle] = useState(null);
    const [custom, setCustom] = useState({}); // uid → 금액 입력값
    const [msg, setMsg] = useState("");

    const load = useCallback(async () => {
        try {
            const d = await getShared(subId);
            setDetail(d);
            setCustom(
                Object.fromEntries(
                    d.members
                        .filter((m) => m.role === "member")
                        .map((m) => [m.uid, String(m.share_amount)]),
                ),
            );
        } catch (e) {
            setMsg(e.message);
        }
    }, [subId]);

    const loadSettle = useCallback(() => {
        getSettlements(subId, ym)
            .then(setSettle)
            .catch((e) => setMsg(e.message));
    }, [subId, ym]);

    useEffect(() => {
        load();
        getFriends()
            .then((fs) => setFriends(fs.filter((f) => f.status === "accepted")))
            .catch(() => {});
    }, [load]);
    useEffect(() => {
        loadSettle();
    }, [loadSettle]);

    // 변경 후 공통 처리: 상세·정산 다시 읽고 바깥 목록도 갱신
    const run = async (fn) => {
        setMsg("");
        try {
            await fn();
            await load();
            loadSettle();
            onChanged?.();
        } catch (e) {
            setMsg(e.message);
        }
    };

    if (!detail)
        return (
            <Shell onClose={onClose} title="공유 구독">
                <p style={{ color: msg ? "#E50914" : C.muted, fontSize: 14 }}>{msg || "불러오는 중..."}</p>
            </Shell>
        );

    const owner = detail.is_owner;
    const memberUids = new Set(detail.members.map((m) => m.uid));
    const invitable = friends.filter((f) => !memberUids.has(f.uid));
    const others = detail.members.filter((m) => m.role === "member");
    const customSum = others.reduce((a, m) => a + (Number(custom[m.uid]) || 0), 0);

    return (
        <Shell onClose={onClose} title={`${detail.title} 공유`}>
            <p style={{ fontSize: 13, color: C.sub, margin: "-8px 0 16px" }}>
                구독료 {formatPrice(detail.price)} / {detail.billing_cycle === "yearly" ? "연" : "월"} ·{" "}
                {detail.split_type === "equal" ? "균등 분담" : "지정 금액 분담"}
            </p>

            {/* 참여자 */}
            <div style={section}>
                <p style={label}>참여자</p>
                {detail.members.map((m) => (
                    <div
                        key={m.uid}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 0",
                            borderBottom: "1px solid #F5F5F5",
                        }}
                    >
                        <span style={{ flex: 1, fontSize: 14, color: C.ink }}>
                            {m.user_name}
                            {m.role === "owner" && <Tag>소유자</Tag>}
                            {m.status === "invited" && <Tag muted>초대 중</Tag>}
                            {m.uid === myUid && <Tag muted>나</Tag>}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                            {formatPrice(m.share_amount)}
                        </span>
                        {owner && m.role === "member" && (
                            <button
                                style={smallBtn("#FFF0F0", "#E50914")}
                                onClick={() => run(() => removeSharedMember(subId, m.uid))}
                            >
                                내보내기
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* 친구 초대 (소유자) */}
            {owner && detail.status === "subscribed" && (
                <div style={section}>
                    <p style={label}>친구 초대</p>
                    {invitable.length === 0 ? (
                        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
                            초대할 수 있는 친구가 없습니다. 친구 탭에서 먼저 친구를 추가하세요.
                        </p>
                    ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {invitable.map((f) => (
                                <button
                                    key={f.uid}
                                    style={smallBtn("#F0EFFE", C.brand)}
                                    onClick={() => run(() => inviteToShared(subId, f.uid))}
                                >
                                    + {f.user_name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 분담 방식 (소유자) */}
            {owner && others.length > 0 && (
                <div style={section}>
                    <p style={label}>분담 방식</p>
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <button
                            style={pill(detail.split_type === "equal")}
                            onClick={() => run(() => updateSharedSplit(subId, "equal"))}
                        >
                            균등 분담
                        </button>
                        <button
                            style={pill(detail.split_type === "custom")}
                            onClick={() =>
                                run(() =>
                                    updateSharedSplit(
                                        subId,
                                        "custom",
                                        others.map((m) => ({ uid: m.uid, amount: m.share_amount })),
                                    ),
                                )
                            }
                        >
                            지정 금액
                        </button>
                    </div>
                    {detail.split_type === "custom" && (
                        <>
                            {others.map((m) => (
                                <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                    <span style={{ flex: 1, fontSize: 13, color: C.ink }}>{m.user_name}</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={custom[m.uid] ?? ""}
                                        onChange={(e) => setCustom((c) => ({ ...c, [m.uid]: e.target.value }))}
                                        style={{
                                            width: 110,
                                            padding: "6px 10px",
                                            borderRadius: 10,
                                            border: "1px solid #DDD",
                                            fontSize: 13,
                                            textAlign: "right",
                                        }}
                                    />
                                    <span style={{ fontSize: 12, color: C.muted }}>원</span>
                                </div>
                            ))}
                            <p style={{ fontSize: 12, color: customSum > detail.price ? "#E50914" : C.muted, margin: "4px 0 8px" }}>
                                소유자 부담 {formatPrice(Math.max(detail.price - customSum, 0))}
                                {customSum > detail.price && " · 참여자 합계가 구독료를 넘습니다"}
                            </p>
                            <button
                                style={{ ...pill(true), width: "100%" }}
                                disabled={customSum > detail.price}
                                onClick={() =>
                                    run(() =>
                                        updateSharedSplit(
                                            subId,
                                            "custom",
                                            others.map((m) => ({ uid: m.uid, amount: Number(custom[m.uid]) || 0 })),
                                        ),
                                    )
                                }
                            >
                                분담액 저장
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* 정산 */}
            {settle && (others.length > 0 || settle.items.length > 0) && (
                <div style={section}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <p style={{ ...label, margin: 0 }}>정산</p>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button style={navBtn} onClick={() => setYm((v) => shiftYm(v, -1))} aria-label="이전 달">‹</button>
                            <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
                                {ym.slice(0, 4)}년 {Number(ym.slice(5))}월
                            </span>
                            <button style={navBtn} onClick={() => setYm((v) => shiftYm(v, 1))} aria-label="다음 달">›</button>
                        </span>
                    </div>
                    {!settle.due_date ? (
                        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>이 달에는 결제 회차가 없습니다</p>
                    ) : (
                        <>
                            <p style={{ fontSize: 12, color: C.muted, margin: "0 0 6px" }}>
                                {Number(settle.due_date.slice(5, 7))}월 {Number(settle.due_date.slice(8))}일 회차
                            </p>
                            {settle.items
                                .filter((it) => owner || it.uid === myUid)
                                .map((it) => (
                                    <div key={it.uid} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                                        <span style={{ flex: 1, fontSize: 13, color: C.ink }}>
                                            {it.user_name}
                                            {it.member_status === "left" && <Tag muted>나감</Tag>}
                                        </span>
                                        <span style={{ fontSize: 13, color: C.sub }}>{formatPrice(it.amount)}</span>
                                        {owner ? (
                                            <button
                                                style={it.paid ? smallBtn("#E6F6EE", "#1D9E75") : smallBtn("#F5F5F5", C.sub)}
                                                onClick={() => run(() => setSettlement(subId, it.uid, settle.due_date, !it.paid))}
                                            >
                                                {it.paid ? "✓ 정산 완료" : "미정산"}
                                            </button>
                                        ) : (
                                            <span style={{ fontSize: 12, fontWeight: 600, color: it.paid ? "#1D9E75" : "#E85D14" }}>
                                                {it.paid ? "✓ 정산 완료" : "정산 전"}
                                            </span>
                                        )}
                                    </div>
                                ))}
                        </>
                    )}
                </div>
            )}

            {/* 나가기 (참여자) */}
            {!owner && (
                <button
                    style={{ ...pill(false), width: "100%", color: "#E50914", background: "#FFF0F0" }}
                    onClick={() =>
                        run(async () => {
                            await removeSharedMember(subId, myUid);
                            onClose();
                        })
                    }
                >
                    공유 구독에서 나가기
                </button>
            )}

            {msg && <p style={{ color: "#E50914", fontSize: 13, textAlign: "center", margin: "12px 0 0" }}>{msg}</p>}
        </Shell>
    );
}

const navBtn = { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.brand, padding: "0 4px" };

function Tag({ children, muted }) {
    return (
        <span
            style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                borderRadius: 6,
                padding: "1px 5px",
                background: muted ? "#F5F5F5" : "#EDE9FF",
                color: muted ? C.muted : C.dark,
            }}
        >
            {children}
        </span>
    );
}

function Shell({ title, onClose, children }) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                zIndex: 999,
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: "#fff",
                    borderRadius: "24px 24px 0 0",
                    padding: "24px 20px 32px",
                    width: "100%",
                    maxWidth: 420,
                    maxHeight: "85vh",
                    overflowY: "auto",
                    boxSizing: "border-box",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h2>
                    <button
                        onClick={onClose}
                        style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}
                    >
                        ✕
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}
