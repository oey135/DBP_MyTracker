// ─────────────────────────────────────────────
// components/CalendarTab.jsx
// 캘린더 탭 — 월별 결제일 시각화 + 구독 목록
//
// DB 컬럼 활용:
//   billing_date → 결제일(day) 추출 → 캘린더 날짜 배치
//   start_date   → 구독 시작 전 달은 표시 안 함
//   status       → subscribed(정상) / cancelled(회색 ghost)
//   price        → 날짜 배지 금액 + 월 합계
// ─────────────────────────────────────────────

import { useState } from "react";
import { formatPrice, wasActiveInMonth, effectiveBillingDay, getBillingDay } from "../utils/subscriptionUtils";
import { getServiceMeta, MONTH_KO, DOW } from "../constants/serviceMeta";

export default function CalendarTab({ subscriptions }) {
  const today = new Date();
  const [viewYear,    setViewYear]    = useState(today.getFullYear());
  const [viewMonth,   setViewMonth]   = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday  = new Date(viewYear, viewMonth, 1).getDay();
  const totalCells    = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  // ── 날짜별 구독 분류 ──────────────────────
  const activeByDay    = {};
  const cancelledByDay = {};
  for (let d = 1; d <= daysInMonth; d++) {
    activeByDay[d]    = subscriptions.filter(s =>
      s.status === "subscribed" &&
      effectiveBillingDay(s.billing_date, daysInMonth) === d &&
      wasActiveInMonth(s, viewYear, viewMonth)
    );
    cancelledByDay[d] = subscriptions.filter(s =>
      s.status === "cancelled" &&
      effectiveBillingDay(s.billing_date, daysInMonth) === d &&
      wasActiveInMonth(s, viewYear, viewMonth)
    );
  }

  const monthlyTotal = Object.values(activeByDay).flat().reduce((sum, s) => sum + s.price, 0);

  // ── 월 이동 ───────────────────────────────
  const prevMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const selActive    = selectedDay ? (activeByDay[selectedDay]    || []) : [];
  const selCancelled = selectedDay ? (cancelledByDay[selectedDay] || []) : [];
  const selTotal     = selActive.reduce((s, sub) => s + sub.price, 0);

  return (
    <div style={{ padding: "20px 16px 16px" }}>

      {/* 월 네비게이션 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7F77DD", padding: "4px 10px" }}>‹</button>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#1A1A2E" }}>
            {viewYear}년 {MONTH_KO[viewMonth]}
          </p>
          <p style={{ fontSize: 12, color: "#7F77DD", margin: "2px 0 0", fontWeight: 600 }}>
            {formatPrice(monthlyTotal)}
          </p>
        </div>
        <button onClick={nextMonth} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#7F77DD", padding: "4px 10px" }}>›</button>
      </div>

      {/* 범례 */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7F77DD" }} />
          <span style={{ fontSize: 10, color: "#999" }}>구독 중</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ccc", border: "1px dashed #bbb" }} />
          <span style={{ fontSize: 10, color: "#999" }}>해지됨</span>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
        {DOW.map((d, i) => (
          <div key={d} style={{
            textAlign: "center", fontSize: 11, fontWeight: 600, padding: "4px 0",
            color: i === 0 ? "#E50914" : i === 6 ? "#4A90E2" : "#aaa",
          }}>
            {d}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0", marginBottom: 16 }}>
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum   = i - firstWeekday + 1;
          const isValid  = dayNum >= 1 && dayNum <= daysInMonth;
          const actives  = isValid ? (activeByDay[dayNum]    || []) : [];
          const cancels  = isValid ? (cancelledByDay[dayNum] || []) : [];
          const hasActive    = actives.length > 0;
          const hasCancelled = cancels.length > 0;
          const hasAny       = hasActive || hasCancelled;
          const activeTotal  = actives.reduce((s, b) => s + b.price, 0);
          const isToday      = isValid && viewYear === todayY && viewMonth === todayM && dayNum === todayD;
          const isSelected   = isValid && selectedDay === dayNum;
          const dow = i % 7;

          return (
            <div
              key={i}
              onClick={() => isValid && hasAny && setSelectedDay(isSelected ? null : dayNum)}
              style={{
                minHeight: 56, padding: "4px 2px",
                cursor: isValid && hasAny ? "pointer" : "default",
                display: "flex", flexDirection: "column", alignItems: "center",
                borderRadius: 10,
                background: isSelected ? "#EDE9FF" : "transparent",
              }}
            >
              {isValid && (
                <>
                  {/* 날짜 숫자 */}
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2,
                    background: isToday ? "#7F77DD" : "transparent",
                    fontSize: 13, fontWeight: isToday || hasAny ? 700 : 400,
                    color: isToday ? "#fff" : dow === 0 ? "#E50914" : dow === 6 ? "#4A90E2" : "#1A1A2E",
                  }}>
                    {dayNum}
                  </div>

                  {/* 결제 인디케이터 */}
                  {hasAny && (
                    <>
                      <div style={{ display: "flex", gap: 2, marginBottom: 2, flexWrap: "wrap", justifyContent: "center", maxWidth: 30 }}>
                        {actives.slice(0, 2).map((b, bi) => {
                          const meta = getServiceMeta(b.title);
                          return <div key={"a"+bi} style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color }} />;
                        })}
                        {cancels.slice(0, 1).map((_, bi) => (
                          <div key={"c"+bi} style={{ width: 5, height: 5, borderRadius: "50%", background: "#ddd", border: "1px dashed #bbb" }} />
                        ))}
                      </div>

                      {hasActive ? (
                        <div style={{
                          fontSize: 9, fontWeight: 700, color: "#7F77DD",
                          background: "#F0EFFE", borderRadius: 6, padding: "1px 4px",
                          maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          lineHeight: 1.4,
                        }}>
                          {activeTotal >= 10000 ? `${Math.round(activeTotal / 1000)}k` : activeTotal.toLocaleString()}
                        </div>
                      ) : (
                        <div style={{
                          fontSize: 9, fontWeight: 600, color: "#bbb",
                          background: "#F5F5F5", borderRadius: 6, padding: "1px 4px",
                          lineHeight: 1.4, textDecoration: "line-through",
                        }}>
                          {cancels.reduce((s, b) => s + b.price, 0) >= 10000
                            ? `${Math.round(cancels.reduce((s, b) => s + b.price, 0) / 1000)}k`
                            : cancels.reduce((s, b) => s + b.price, 0).toLocaleString()}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 상세 / 월 목록 */}
      {selectedDay
        ? <DayDetail day={selectedDay} month={viewMonth} active={selActive} cancelled={selCancelled} total={selTotal} />
        : <MonthList subscriptions={subscriptions} viewYear={viewYear} viewMonth={viewMonth} daysInMonth={daysInMonth} />
      }
    </div>
  );
}

// ── 날짜 클릭 시 상세 뷰 ─────────────────────
function DayDetail({ day, month, active, cancelled, total }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>
          {month + 1}월 {day}일
        </p>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#7F77DD" }}>{formatPrice(total)}</span>
      </div>

      {active.length === 0 && cancelled.length === 0 && (
        <p style={{ fontSize: 13, color: "#ccc", textAlign: "center", padding: "16px 0" }}>결제 없음</p>
      )}

      {/* 활성 구독 */}
      {active.map(s => {
        const meta = getServiceMeta(s.title);
        return (
          <div key={s.title} style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fff", border: "1px solid #F0F0F0",
            borderRadius: 14, padding: "12px 14px", marginBottom: 8,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: "#1A1A2E" }}>{s.title}</p>
              {s.memo && <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>{s.memo}</p>}
            </div>
            <p style={{ fontWeight: 700, fontSize: 15, color: "#534AB7", margin: 0 }}>{formatPrice(s.price)}</p>
          </div>
        );
      })}

      {/* 해지된 구독 구분선 + 목록 */}
      {cancelled.length > 0 && (
        <>
          {active.length > 0 && (
            <p style={{ fontSize: 11, color: "#bbb", margin: "12px 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, height: 1, background: "#F0F0F0", display: "inline-block" }} />
              해지된 구독
              <span style={{ flex: 1, height: 1, background: "#F0F0F0", display: "inline-block" }} />
            </p>
          )}
          {cancelled.map(s => {
            const meta = getServiceMeta(s.title);
            return (
              <div key={s.title} style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "#F9F9F9", border: "1px dashed #E0E0E0",
                borderRadius: 14, padding: "12px 14px", marginBottom: 8, opacity: 0.7,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, filter: "grayscale(60%)" }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: "#aaa", textDecoration: "line-through" }}>{s.title}</p>
                  <p style={{ fontSize: 11, color: "#bbb", margin: "2px 0 0" }}>해지됨</p>
                </div>
                <p style={{ fontWeight: 600, fontSize: 15, color: "#ccc", margin: 0, textDecoration: "line-through" }}>{formatPrice(s.price)}</p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── 월 전체 목록 (결제일 순 그룹) ─────────────
function MonthList({ subscriptions, viewYear, viewMonth, daysInMonth }) {
  const allSubs = subscriptions.filter(s =>
    getBillingDay(s.billing_date) && wasActiveInMonth(s, viewYear, viewMonth)
  );

  if (allSubs.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "#ccc", textAlign: "center", padding: "20px 0" }}>
        이 달에 결제 내역이 없습니다
      </p>
    );
  }

  // 결제일 기준 그룹화
  const groups = {};
  allSubs.forEach(s => {
    const day = effectiveBillingDay(s.billing_date, daysInMonth);
    if (!groups[day]) groups[day] = { active: [], cancelled: [] };
    if (s.status === "subscribed") groups[day].active.push(s);
    else groups[day].cancelled.push(s);
  });

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", margin: "0 0 12px" }}>
        {MONTH_KO[viewMonth]} 전체 구독 목록
      </p>
      {Object.keys(groups).map(Number).sort((a, b) => a - b).map(day => {
        const { active, cancelled } = groups[day];
        const dayTotal = active.reduce((s, b) => s + b.price, 0);
        return (
          <div key={day} style={{ marginBottom: 16 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid #F5F5F5",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#7F77DD" }}>
                {viewMonth + 1}월 {day}일
              </span>
              <span style={{ fontSize: 12, color: "#7F77DD", fontWeight: 600 }}>
                {formatPrice(dayTotal)}
              </span>
            </div>

            {active.map(s => {
              const meta = getServiceMeta(s.title);
              return (
                <div key={s.title} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 12,
                  background: "#FAFAFA", marginBottom: 4,
                }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#333", fontWeight: 500 }}>{s.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#534AB7" }}>{formatPrice(s.price)}</span>
                </div>
              );
            })}

            {cancelled.map(s => {
              const meta = getServiceMeta(s.title);
              return (
                <div key={s.title} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 12,
                  background: "#F5F5F5", marginBottom: 4, opacity: 0.6,
                }}>
                  <span style={{ fontSize: 16, filter: "grayscale(70%)" }}>{meta.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#bbb", fontWeight: 500, textDecoration: "line-through" }}>{s.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc", textDecoration: "line-through" }}>{formatPrice(s.price)}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
