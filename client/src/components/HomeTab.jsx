// ─────────────────────────────────────────────
// components/HomeTab.jsx
// 홈 탭 — 월 결제 요약 카드 + 결제 예정 알림 + 구독 미리보기
// ─────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
    formatPrice,
    formatBillingDay,
    getDaysUntil,
    formatNextDate,
    monthlyCost,
    annualCost,
    myAmount,
} from "../utils/subscriptionUtils";
import { getServiceMeta } from "../constants/serviceMeta";
import { getAlerts } from "../db/api";

export default function HomeTab({ subscriptions, onNavigate }) {
    // 서버가 계산한 알림 (구독이 바뀔 때마다 다시 조회)
    const [alerts, setAlerts] = useState(null);
    useEffect(() => {
        getAlerts()
            .then(setAlerts)
            .catch((err) => console.error("알림 조회 실패:", err));
    }, [subscriptions]);

    const active = subscriptions.filter((s) => s.status === "subscribed");
    const monthly = active.reduce((sum, s) => sum + monthlyCost(s), 0);
    const yearly = active.reduce(
        (sum, s) =>
            sum + annualCost(s),
        0,
    );

    const alertedIds = new Set((alerts?.upcoming ?? []).map((a) => a.sub_id));

    const upcomingBills = active
        .map((s) => ({
            ...s,
            days: getDaysUntil(s.billing_date, s.billing_cycle),
        }))
        // 알림 대상 여부는 서버(/api/alerts upcoming)가 notify_days_before 기준으로 계산한 결과만 따른다.
        // 알림을 끈 구독(notify_days_before = NULL)은 일정에는 보이지만 알림(🔔·강조)은 붙지 않는다.
        .map((s) => ({
            ...s,
            alerted: alertedIds.has(s.sub_id),
            muted: s.notify_days_before == null,
        }))
        .filter((s) => s.days >= 0 && (s.alerted || s.days <= 14))
        .sort((a, b) => b.alerted - a.alerted || a.days - b.days)
        .slice(0, 5);

    return (
        <div style={{ padding: "24px 20px 16px" }}>
            {/* 요약 카드 */}
            <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 13, color: "#999", margin: "0 0 2px" }}>
                    안녕하세요 👋
                </p>
                <h1
                    style={{
                        fontSize: 22,
                        fontWeight: 700,
                        margin: "0 0 20px",
                        color: "#1A1A2E",
                    }}
                >
                    이번 달 구독 현황
                </h1>
                <div
                    style={{
                        background:
                            "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)",
                        borderRadius: 20,
                        padding: "24px 24px 20px",
                        color: "#fff",
                    }}
                >
                    <p
                        style={{
                            fontSize: 13,
                            opacity: 0.8,
                            margin: "0 0 6px",
                        }}
                    >
                        월 결제 총액
                    </p>
                    <p
                        style={{
                            fontSize: 32,
                            fontWeight: 700,
                            margin: "0 0 16px",
                            letterSpacing: -1,
                        }}
                    >
                        {formatPrice(monthly)}
                    </p>
                    <div style={{ display: "flex", gap: 20 }}>
                        <div>
                            <p
                                style={{
                                    fontSize: 12,
                                    opacity: 0.7,
                                    margin: "0 0 2px",
                                }}
                            >
                                구독 중
                            </p>
                            <p
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    margin: 0,
                                }}
                            >
                                {active.length}개
                            </p>
                        </div>
                        <div>
                            <p
                                style={{
                                    fontSize: 12,
                                    opacity: 0.7,
                                    margin: "0 0 2px",
                                }}
                            >
                                연간 예상
                            </p>
                            <p
                                style={{
                                    fontSize: 18,
                                    fontWeight: 600,
                                    margin: 0,
                                }}
                            >
                                {formatPrice(yearly)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 알림 (결제 알림·정산·초대·친구 요청) */}
            <AlertsCard alerts={alerts} onNavigate={onNavigate} />

            {/* 결제 일정 (14일 이내 + 알림 설정 범위). 알림 여부와 무관한 일정 목록 */}
            {upcomingBills.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                    <h2
                        style={{
                            fontSize: 16,
                            fontWeight: 600,
                            margin: "0 0 12px",
                            color: "#1A1A2E",
                        }}
                    >
                        다가오는 결제 일정
                    </h2>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        {upcomingBills.map((s) => {
                            const meta = getServiceMeta(s.title);
                            return (
                                <div
                                    key={s.sub_id ?? s.title}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        background: "#fff",
                                        border: "1px solid #F0F0F0",
                                        borderRadius: 14,
                                        padding: "12px 14px",
                                    }}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: 36,
                                                height: 36,
                                                borderRadius: 10,
                                                background: meta.bg,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontSize: 18,
                                            }}
                                        >
                                            {meta.icon}
                                        </div>
                                        <div>
                                            <p
                                                style={{
                                                    fontWeight: 600,
                                                    fontSize: 14,
                                                    margin: 0,
                                                    color: "#1A1A2E",
                                                }}
                                            >
                                                {s.title}
                                            </p>
                                            <p
                                                style={{
                                                    fontSize: 12,
                                                    color: "#999",
                                                    margin: 0,
                                                }}
                                            >
                                                {s.alerted ? "🔔 " : s.muted ? "🔕 " : ""}
                                                {s.billing_cycle === "yearly" &&
                                                    "연간 · "}
                                                {s.days === 0
                                                    ? "오늘 결제"
                                                    : `${s.days}일 후 (${formatNextDate(s.billing_date, s.billing_cycle)})`}
                                            </p>
                                        </div>
                                    </div>
                                    <p
                                        style={{
                                            fontWeight: 700,
                                            fontSize: 14,
                                            margin: 0,
                                            color:
                                                s.alerted
                                                    ? "#E50914"
                                                    : "#7F77DD",
                                        }}
                                    >
                                        {formatPrice(myAmount(s))}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* 구독 미리보기 (최대 3개) */}
            <div style={{ marginBottom: 8 }}>
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 12,
                    }}
                >
                    <h2
                        style={{
                            fontSize: 16,
                            fontWeight: 600,
                            margin: 0,
                            color: "#1A1A2E",
                        }}
                    >
                        내 구독 목록
                    </h2>
                    <button
                        onClick={() => onNavigate("subscriptions")}
                        style={{
                            fontSize: 13,
                            color: "#7F77DD",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontWeight: 500,
                        }}
                    >
                        전체 보기
                    </button>
                </div>
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                    {active.slice(0, 3).map((s) => {
                        const meta = getServiceMeta(s.title);
                        return (
                            <div
                                key={s.sub_id ?? s.title}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    background: "#fff",
                                    border: "1px solid #F0F0F0",
                                    borderRadius: 14,
                                    padding: "12px 14px",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 10,
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 40,
                                            height: 40,
                                            borderRadius: 12,
                                            background: meta.bg,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 20,
                                        }}
                                    >
                                        {meta.icon}
                                    </div>
                                    <div>
                                        <p
                                            style={{
                                                fontWeight: 600,
                                                fontSize: 15,
                                                margin: 0,
                                                color: "#1A1A2E",
                                            }}
                                        >
                                            {s.title}
                                        </p>
                                        <p
                                            style={{
                                                fontSize: 12,
                                                color: "#999",
                                                margin: 0,
                                            }}
                                        >
                                            {formatBillingDay(
                                                s.billing_date,
                                                s.billing_cycle,
                                            )}{" "}
                                            결제
                                        </p>
                                    </div>
                                </div>
                                <p
                                    style={{
                                        fontWeight: 700,
                                        fontSize: 15,
                                        color: "#1A1A2E",
                                        margin: 0,
                                    }}
                                >
                                    {formatPrice(myAmount(s))}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── 알림 카드 ─────────────────────────────────
// 결제 알림은 서버가 notify_days_before 범위에 든 구독만 골라 준 upcoming을 그대로 쓴다.
// (알림 끔 = NULL 이면 여기에 나오지 않는다)
function AlertsCard({ alerts, onNavigate }) {
    if (!alerts) return null;
    const items = [];
    for (const u of alerts.upcoming ?? [])
        items.push({
            key: `up-${u.sub_id}-${u.due_date}`,
            icon: "🔔",
            text: `${u.title} ${u.days_left === 0 ? "오늘 결제" : `${u.days_left}일 후 결제`} · ${formatPrice(u.amount)}`,
            sub: `결제 예정일 ${u.due_date}`,
            tab: "subscriptions",
        });
    const receive = alerts.settlements.filter((x) => x.direction === "receive");
    const send = alerts.settlements.filter((x) => x.direction === "send");
    if (receive.length)
        items.push({
            key: "receive",
            icon: "💰",
            text: `받을 정산 ${receive.length}건 · ${formatPrice(receive.reduce((a, x) => a + x.amount, 0))}`,
            sub: receive.map((x) => `${x.user_name}(${x.title})`).join(", "),
            tab: "subscriptions",
        });
    if (send.length)
        items.push({
            key: "send",
            icon: "💸",
            text: `보낼 정산 ${send.length}건 · ${formatPrice(send.reduce((a, x) => a + x.amount, 0))}`,
            sub: send.map((x) => x.title).join(", "),
            tab: "subscriptions",
        });
    if (alerts.invites)
        items.push({ key: "inv", icon: "📨", text: `공유 구독 초대 ${alerts.invites}건`, tab: "subscriptions" });
    if (alerts.friendRequests)
        items.push({ key: "fr", icon: "👋", text: `받은 친구 요청 ${alerts.friendRequests}건`, tab: "friends" });
    if (items.length === 0) return null;

    return (
        <div style={{ marginBottom: 24, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
                <button
                    key={it.key}
                    onClick={() => onNavigate(it.tab)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        textAlign: "left",
                        background: "#FFF8EC",
                        border: "1px solid #FBE7C2",
                        borderRadius: 14,
                        padding: "10px 14px",
                        cursor: "pointer",
                        fontFamily: "inherit",
                    }}
                >
                    <span style={{ fontSize: 18 }}>{it.icon}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1A1A2E" }}>
                            {it.text}
                        </span>
                        {it.sub && (
                            <span
                                style={{
                                    display: "block",
                                    fontSize: 11,
                                    color: "#999",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {it.sub}
                            </span>
                        )}
                    </span>
                    <span style={{ color: "#ccc" }}>›</span>
                </button>
            ))}
        </div>
    );
}
