// ─────────────────────────────────────────────
// components/StatsTab.jsx
// 분석 탭 — 구독 지출 분석 (기획서 2)
//
//   이번 달 vs 지난달      /api/stats/overview
//   월별 추이 (12개월)     /api/stats/monthly
//   서비스별·카테고리별    /api/stats/breakdown
//   월간 vs 연간 구독      /api/stats/overview (byCycle)
//   향후 예상 지출         /api/stats/forecast
//
// 예정 = 구독 정보로 계산한 금액 / 실제 = 캘린더에서 기록한 결제 내역
// ─────────────────────────────────────────────

import { useEffect, useState } from "react";
import {
    getStatsOverview,
    getStatsMonthly,
    getStatsBreakdown,
    getStatsForecast,
} from "../db/api";
import { formatPrice } from "../utils/subscriptionUtils";
import { getServiceMeta } from "../constants/serviceMeta";
import { CATEGORY_LABEL } from "../constants/categories";
const C = {
    ink: "#1A1A2E",
    sub: "#666",
    muted: "#999",
    brand: "#7F77DD",
    brandDark: "#534AB7",
    brandLight: "#D9D5F7",
    card: "#fff",
    border: "#F0F0F0",
};

const card = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    padding: "16px",
    marginBottom: 16,
};
const h2 = { fontSize: 15, fontWeight: 700, color: C.ink, margin: "0 0 12px" };
const pct = (v) => `${Math.round(v * 100)}%`;
const short = (n) =>
    n >= 10000 ? `${Math.round(n / 1000).toLocaleString()}k` : n.toLocaleString();

export default function StatsTab({ subscriptions }) {
    const thisYear = new Date().getFullYear();
    const [year, setYear] = useState(thisYear);
    const [overview, setOverview] = useState(null);
    const [monthly, setMonthly] = useState(null);
    const [breakdown, setBreakdown] = useState(null);
    const [forecast, setForecast] = useState(null);
    const [error, setError] = useState("");

    // 구독이 바뀌면(추가·수정·해지) 다시 불러온다
    useEffect(() => {
        Promise.all([getStatsOverview(), getStatsForecast(6)])
            .then(([o, f]) => {
                setOverview(o);
                setForecast(f);
            })
            .catch((e) => setError(e.message));
    }, [subscriptions]);

    useEffect(() => {
        Promise.all([getStatsMonthly(year), getStatsBreakdown(year)])
            .then(([m, b]) => {
                setMonthly(m);
                setBreakdown(b);
            })
            .catch((e) => setError(e.message));
    }, [year, subscriptions]);

    if (error)
        return (
            <p style={{ padding: 20, color: "#E50914", fontSize: 14 }}>
                통계를 불러오지 못했습니다: {error}
            </p>
        );
    if (!overview || !monthly || !breakdown || !forecast)
        return (
            <p style={{ padding: 20, textAlign: "center", color: "#aaa", fontSize: 14 }}>
                불러오는 중...
            </p>
        );

    return (
        <div style={{ padding: "24px 20px 16px" }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.ink, margin: "0 0 16px" }}>
                지출 분석
            </h1>

            <MonthCompare overview={overview} />
            <CycleCompare overview={overview} />

            {/* 연도 선택 — 아래 월별 추이·실제 지출 통계에 적용 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, margin: "8px 0 12px" }}>
                <button onClick={() => setYear((y) => y - 1)} style={navBtn} aria-label="이전 연도">‹</button>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>{year}년</span>
                <button onClick={() => setYear((y) => y + 1)} style={navBtn} aria-label="다음 연도">›</button>
            </div>

            <MonthlyChart monthly={monthly} />
            <Breakdown breakdown={breakdown} />
            <Forecast forecast={forecast} />
        </div>
    );
}

const navBtn = {
    background: "none",
    border: "none",
    fontSize: 22,
    cursor: "pointer",
    color: C.brand,
    padding: "0 8px",
};

// ── 이번 달 vs 지난달 ─────────────────────────
function MonthCompare({ overview }) {
    const { thisMonth, lastMonth, expected } = overview;
    const diff = (a, b) => {
        const d = a - b;
        if (d === 0) return { text: "지난달과 같음", color: C.muted };
        return {
            text: `지난달보다 ${formatPrice(Math.abs(d))} ${d > 0 ? "증가 ▲" : "감소 ▼"}`,
            color: d > 0 ? "#E50914" : "#1D9E75",
        };
    };
    const ds = diff(thisMonth.scheduled, lastMonth.scheduled);
    const dp = diff(thisMonth.paid, lastMonth.paid);
    const m = (ym) => `${Number(ym.slice(5))}월`;

    return (
        <div
            style={{
                background: "linear-gradient(135deg, #7F77DD 0%, #534AB7 100%)",
                borderRadius: 20,
                padding: "20px",
                color: "#fff",
                marginBottom: 16,
            }}
        >
            <p style={{ fontSize: 13, opacity: 0.85, margin: "0 0 4px" }}>{m(thisMonth.ym)} 결제 예정</p>
            <p style={{ fontSize: 28, fontWeight: 800, margin: "0 0 2px" }}>{formatPrice(thisMonth.scheduled)}</p>
            <p style={{ fontSize: 12, margin: "0 0 14px", color: "#fff", opacity: 0.9 }}>
                {ds.text} ({m(lastMonth.ym)} {formatPrice(lastMonth.scheduled)})
            </p>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <Kpi label={`${m(thisMonth.ym)} 실제 결제`} value={formatPrice(thisMonth.paid)} hint={`${thisMonth.paidCount}건 기록 · ${dp.text}`} />
                <Kpi label="월평균 예상" value={formatPrice(expected.monthly)} />
                <Kpi label="연간 예상" value={formatPrice(expected.annual)} />
            </div>
        </div>
    );
}

function Kpi({ label, value, hint }) {
    return (
        <div>
            <p style={{ fontSize: 11, opacity: 0.8, margin: "0 0 2px" }}>{label}</p>
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{value}</p>
            {hint && <p style={{ fontSize: 10, opacity: 0.8, margin: "2px 0 0" }}>{hint}</p>}
        </div>
    );
}

// ── 월간 vs 연간 구독 ─────────────────────────
function CycleCompare({ overview }) {
    const { monthly, yearly } = overview.byCycle;
    if (!monthly && !yearly) return null;
    const box = (title, d, lines) => (
        <div style={{ flex: 1, background: "#F8F7FF", borderRadius: 12, padding: "12px" }}>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 6px", fontWeight: 600 }}>{title}</p>
            {d ? (
                lines(d)
            ) : (
                <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>없음</p>
            )}
        </div>
    );
    const line = (label, v, strong) => (
        <p style={{ fontSize: 12, color: C.sub, margin: "2px 0", display: "flex", justifyContent: "space-between", gap: 6 }}>
            <span>{label}</span>
            <span style={{ fontWeight: strong ? 700 : 500, color: strong ? C.brandDark : C.ink }}>{v}</span>
        </p>
    );
    return (
        <div style={card}>
            <p style={h2}>월간 vs 연간 구독</p>
            <div style={{ display: "flex", gap: 8 }}>
                {box("월간 결제", monthly, (d) => (
                    <>
                        {line("구독 수", `${d.count}개`)}
                        {line("매달 결제", formatPrice(d.total))}
                        {line("월평균", formatPrice(d.monthlyAvg), true)}
                    </>
                ))}
                {box("연간 결제", yearly, (d) => (
                    <>
                        {line("구독 수", `${d.count}개`)}
                        {line("연 결제액", formatPrice(d.total))}
                        {line("월평균 환산", formatPrice(d.monthlyAvg), true)}
                    </>
                ))}
            </div>
        </div>
    );
}

// ── 월별 추이 (막대: 예정 / 실제) ─────────────
function MonthlyChart({ monthly }) {
    const [hover, setHover] = useState(null);
    const max = Math.max(1, ...monthly.months.map((m) => Math.max(m.scheduled, m.paid)));
    const H = 120;
    const sel = hover != null ? monthly.months[hover] : null;

    return (
        <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <p style={h2}>월별 지출 추이</p>
                <Legend />
            </div>
            <p style={{ fontSize: 12, color: C.sub, margin: "-4px 0 10px", minHeight: 16 }}>
                {sel
                    ? `${sel.month}월 · 예정 ${formatPrice(sel.scheduled)} · 실제 ${formatPrice(sel.paid)}`
                    : `연간 예정 ${formatPrice(monthly.totalScheduled)} · 실제 ${formatPrice(monthly.totalPaid)}`}
            </p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: H, borderBottom: `1px solid ${C.border}` }}>
                {monthly.months.map((m, i) => (
                    <div
                        key={m.ym}
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setHover(hover === i ? null : i)}
                        title={`${m.month}월 예정 ${formatPrice(m.scheduled)} / 실제 ${formatPrice(m.paid)}`}
                        style={{
                            flex: 1, height: "100%", display: "flex", alignItems: "flex-end",
                            justifyContent: "center", gap: 2, cursor: "pointer",
                            background: hover === i ? "#F8F7FF" : "transparent", borderRadius: 4,
                        }}
                    >
                        <Bar h={(m.scheduled / max) * H} color={C.brandLight} />
                        <Bar h={(m.paid / max) * H} color={C.brandDark} />
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                {monthly.months.map((m) => (
                    <span key={m.ym} style={{ flex: 1, textAlign: "center", fontSize: 9, color: C.muted }}>
                        {m.month}
                    </span>
                ))}
            </div>
        </div>
    );
}

function Bar({ h, color }) {
    return (
        <div
            style={{
                width: 6,
                height: Math.max(h, h > 0 ? 2 : 0),
                background: color,
                borderRadius: "4px 4px 0 0",
            }}
        />
    );
}

function Legend() {
    const item = (color, label) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.sub }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
        </span>
    );
    return (
        <span style={{ display: "inline-flex", gap: 10 }}>
            {item(C.brandLight, "예정")}
            {item(C.brandDark, "실제 결제")}
        </span>
    );
}

// ── 서비스별·카테고리별 비중 ──────────────────
function Breakdown({ breakdown }) {
    const [basis, setBasis] = useState("expected"); // expected | paid
    const [dim, setDim] = useState("byService"); // byService | byCategory
    const data = breakdown[basis][dim];
    const valueKey = basis === "expected" ? "monthly" : "total";

    const toggle = (cur, set, opts) => (
        <div style={{ display: "flex", background: "#F5F5F5", borderRadius: 10, padding: 2 }}>
            {opts.map(([v, l]) => (
                <button
                    key={v}
                    onClick={() => set(v)}
                    style={{
                        border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit",
                        background: cur === v ? "#fff" : "transparent",
                        color: cur === v ? C.brandDark : C.muted,
                        fontWeight: cur === v ? 700 : 500,
                    }}
                >
                    {l}
                </button>
            ))}
        </div>
    );

    return (
        <div style={card}>
            <p style={h2}>지출 비중</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {toggle(dim, setDim, [["byService", "서비스별"], ["byCategory", "카테고리별"]])}
                {toggle(basis, setBasis, [["expected", "현재 월 환산"], ["paid", `${breakdown.year}년 실제`]])}
            </div>
            <p style={{ fontSize: 12, color: C.sub, margin: "0 0 10px" }}>
                합계 {formatPrice(data.total)}
                {basis === "expected" ? " / 월" : ""}
            </p>
            {data.items.length === 0 ? (
                <p style={{ fontSize: 13, color: "#ccc", textAlign: "center", padding: "12px 0" }}>
                    {basis === "paid" ? "기록된 결제가 없습니다. 캘린더에서 결제 완료를 기록해 보세요." : "구독 중인 서비스가 없습니다"}
                </p>
            ) : (
                data.items.map((it) => {
                    const label = dim === "byService" ? it.title : CATEGORY_LABEL[it.category] ?? it.category;
                    const icon = dim === "byService" ? getServiceMeta(it.title).icon : null;
                    return (
                        <div key={dim === "byService" ? it.sub_id : it.category} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                                <span style={{ color: C.ink, fontWeight: 500 }}>
                                    {icon && <span style={{ marginRight: 4 }}>{icon}</span>}
                                    {label}
                                    {it.billing_cycle === "yearly" && (
                                        <span style={{ fontSize: 10, color: C.muted, marginLeft: 4 }}>
                                            (연 {formatPrice(it.amount)})
                                        </span>
                                    )}
                                </span>
                                <span style={{ color: C.sub }}>
                                    <b style={{ color: C.ink }}>{formatPrice(it[valueKey])}</b> · {pct(it.share)}
                                </span>
                            </div>
                            <div style={{ height: 8, background: "#F5F5F5", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ width: pct(it.share), height: "100%", background: C.brand, borderRadius: 4 }} />
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ── 향후 예상 지출 ────────────────────────────
function Forecast({ forecast }) {
    const [open, setOpen] = useState(null);
    const max = Math.max(1, ...forecast.months.map((m) => m.total));
    return (
        <div style={card}>
            <p style={h2}>앞으로 6개월 예상 지출</p>
            <p style={{ fontSize: 12, color: C.sub, margin: "-4px 0 12px" }}>
                합계 {formatPrice(forecast.total)}
            </p>
            {forecast.months.map((m) => (
                <div key={m.ym} style={{ marginBottom: 8 }}>
                    <button
                        onClick={() => setOpen(open === m.ym ? null : m.ym)}
                        style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 8,
                            background: "none", border: "none", padding: 0, cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        <span style={{ width: 66, fontSize: 12, color: C.sub, textAlign: "left", whiteSpace: "nowrap" }}>
                            {m.ym.slice(2, 4)}년 {Number(m.ym.slice(5))}월
                        </span>
                        <span style={{ flex: 1, height: 10, background: "#F5F5F5", borderRadius: 4, overflow: "hidden" }}>
                            <span style={{ display: "block", width: `${(m.total / max) * 100}%`, height: "100%", background: C.brand, borderRadius: 4 }} />
                        </span>
                        <span style={{ width: 70, fontSize: 12, fontWeight: 700, color: C.ink, textAlign: "right" }}>
                            {short(m.total)}원
                        </span>
                    </button>
                    {open === m.ym && (
                        <div style={{ margin: "6px 0 4px 74px" }}>
                            {m.items.length === 0 && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>결제 예정 없음</p>}
                            {m.items.map((it) => (
                                <p key={`${it.sub_id}-${it.due_date}`} style={{ fontSize: 12, color: C.sub, margin: "2px 0", display: "flex", justifyContent: "space-between" }}>
                                    <span>
                                        {Number(it.due_date.slice(8))}일 {it.title}
                                        {it.billing_cycle === "yearly" && <span style={{ color: C.brandDark }}> · 연간</span>}
                                    </span>
                                    <span>{formatPrice(it.amount)}</span>
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
