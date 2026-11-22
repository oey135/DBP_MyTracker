// ─────────────────────────────────────────────
// components/CalendarTab.jsx
// 캘린더 탭 — 월별 결제일 시각화 + 구독 목록
//
// DB 컬럼 활용:
//   billing_date → 결제일(day) 추출 → 캘린더 날짜 배치
//   start_date   → 구독 시작 전 달은 표시 안 함
//   status       → subscribed(정상) / cancelled(회색 ghost)
//   price        → 날짜 배지 금액 + 월 합계 (공유 구독은 내 부담액 my_share)
//   end_date     → 해지일 이전 회차는 정상 결제로, 이후 회차는 ghost로 표시
//   payment      → 회차별 "결제 완료" 기록 (type = 'payment', due_date = 그 회차 결제일)
// ─────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { getPayments, addPayment, deletePayment } from "../db/api";
import { formatPrice, myAmount, wasActiveInMonth, effectiveBillingDay, getBillingDay } from "../utils/subscriptionUtils";
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

  // ── 결제 기록 (해당 연도) ─────────────────
  const [payments, setPayments] = useState([]);
  const loadPayments = useCallback(() => {
    getPayments(viewYear)
      .then(setPayments)
      .catch(err => console.error("결제 기록 조회 실패:", err));
  }, [viewYear]);
  useEffect(() => { loadPayments(); }, [loadPayments]);

  // "sub_id|YYYY-MM-DD" → 결제 기록
  const paymentMap = {};
  payments.forEach(p => { paymentMap[`${p.sub_id}|${p.due_date}`] = p; });

  const dueStr = (d) => toDateStr(viewYear, viewMonth, d);
  const todayStr = toDateStr(todayY, todayM, todayD);

  // 결제 완료 기록 / 취소
  const togglePaid = async (sub, due) => {
    const rec = paymentMap[`${sub.sub_id}|${due}`];
    try {
      if (rec) await deletePayment(rec.payment_id);
      else await addPayment({ sub_id: sub.sub_id, due_date: due, paid_at: due });
      loadPayments();
    } catch (err) { console.error(err); }
  };
  const payProps = { paymentMap, todayStr, onTogglePaid: togglePaid };

  // ── 날짜별 구독 분류 ──────────────────────
  // 해지된 구독도 해지일(end_date) 이전 회차는 실제 결제된 것으로 본다
  const isLiveCycle = (s, d) =>
    s.status === "subscribed" || (!!s.end_date && dueStr(d) <= s.end_date);
  const activeByDay    = {};
  const cancelledByDay = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const onDay = subscriptions.filter(s =>
      effectiveBillingDay(s.billing_date, daysInMonth) === d &&
      wasActiveInMonth(s, viewYear, viewMonth)
    );
    activeByDay[d]    = onDay.filter(s => isLiveCycle(s, d));
    cancelledByDay[d] = onDay.filter(s => !isLiveCycle(s, d));
  }

  const monthlyTotal = Object.values(activeByDay).flat().reduce((sum, s) => sum + myAmount(s), 0);

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
  const selTotal     = selActive.reduce((s, sub) => s + myAmount(sub), 0);

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
          const activeTotal  = actives.reduce((s, b) => s + myAmount(b), 0);
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
                          {cancels.reduce((s, b) => s + myAmount(b), 0) >= 10000
                            ? `${Math.round(cancels.reduce((s, b) => s + myAmount(b), 0) / 1000)}k`
                            : cancels.reduce((s, b) => s + myAmount(b), 0).toLocaleString()}
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
        ? <DayDetail day={selectedDay} month={viewMonth} active={selActive} cancelled={selCancelled} total={selTotal} due={dueStr(selectedDay)} {...payProps} />
        : <MonthList activeByDay={activeByDay} cancelledByDay={cancelledByDay} viewYear={viewYear} viewMonth={viewMonth} {...payProps} />
      }
    </div>
  );
}

// ── 날짜 클릭 시 상세 뷰 ─────────────────────
function DayDetail({ day, month, active, cancelled, total, due, paymentMap, todayStr, onTogglePaid }) {
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
          <div key={s.sub_id ?? s.title} style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "#fff", border: "1px solid #F0F0F0",
            borderRadius: 14, padding: "12px 14px", marginBottom: 8,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: meta.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
              {meta.icon}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 14, margin: 0, color: "#1A1A2E" }}>
                {s.title}<CycleTag sub={s} />
              </p>
              {s.memo && <p style={{ fontSize: 11, color: "#aaa", margin: "2px 0 0" }}>{s.memo}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontWeight: 700, fontSize: 15, color: "#534AB7", margin: "0 0 4px" }}>{formatPrice(myAmount(s))}</p>
              <PayToggle sub={s} due={due} record={paymentMap[`${s.sub_id}|${due}`]} todayStr={todayStr} onToggle={onTogglePaid} />
            </div>
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
              <div key={s.sub_id ?? s.title} style={{
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
                <p style={{ fontWeight: 600, fontSize: 15, color: "#ccc", margin: 0, textDecoration: "line-through" }}>{formatPrice(myAmount(s))}</p>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── 월 전체 목록 (결제일 순 그룹) ─────────────
function MonthList({ activeByDay, cancelledByDay, viewYear, viewMonth, paymentMap, todayStr, onTogglePaid }) {
  // 결제일 기준 그룹화
  const groups = {};
  Object.keys(activeByDay).map(Number).forEach(day => {
    const active = activeByDay[day] || [];
    const cancelled = cancelledByDay[day] || [];
    if (active.length || cancelled.length) groups[day] = { active, cancelled };
  });

  if (Object.keys(groups).length === 0) {
    return (
      <p style={{ fontSize: 13, color: "#ccc", textAlign: "center", padding: "20px 0" }}>
        이 달에 결제 내역이 없습니다
      </p>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", margin: "0 0 12px" }}>
        {MONTH_KO[viewMonth]} 전체 구독 목록
      </p>
      {Object.keys(groups).map(Number).sort((a, b) => a - b).map(day => {
        const { active, cancelled } = groups[day];
        const dayTotal = active.reduce((s, b) => s + myAmount(b), 0);
        const due = toDateStr(viewYear, viewMonth, day);
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
                <div key={s.sub_id ?? s.title} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 12,
                  background: "#FAFAFA", marginBottom: 4,
                }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#333", fontWeight: 500 }}>{s.title}<CycleTag sub={s} /></span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#534AB7" }}>{formatPrice(myAmount(s))}</span>
                  <PayToggle sub={s} due={due} record={paymentMap[`${s.sub_id}|${due}`]} todayStr={todayStr} onToggle={onTogglePaid} />
                </div>
              );
            })}

            {cancelled.map(s => {
              const meta = getServiceMeta(s.title);
              return (
                <div key={s.sub_id ?? s.title} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 12,
                  background: "#F5F5F5", marginBottom: 4, opacity: 0.6,
                }}>
                  <span style={{ fontSize: 16, filter: "grayscale(70%)" }}>{meta.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#bbb", fontWeight: 500, textDecoration: "line-through" }}>{s.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ccc", textDecoration: "line-through" }}>{formatPrice(myAmount(s))}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── 공통 ──────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, "0");
// (연, 0부터 시작하는 월, 일) → "YYYY-MM-DD"
const toDateStr = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;

// 연간 결제 구분 표시
function CycleTag({ sub }) {
  if (sub.billing_cycle !== "yearly") return null;
  return (
    <span style={{
      marginLeft: 6, fontSize: 10, fontWeight: 600, color: "#534AB7",
      background: "#EDE9FF", borderRadius: 6, padding: "1px 5px", verticalAlign: "middle",
    }}>
      연간
    </span>
  );
}

// 회차별 결제 완료 기록 토글 (결제일이 지난 회차만 기록 가능)
function PayToggle({ sub, due, record, todayStr, onToggle }) {
  if (!sub.sub_id) return null;
  if (!record && due > todayStr) {
    return <span style={{ fontSize: 11, color: "#bbb", whiteSpace: "nowrap" }}>예정</span>;
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(sub, due); }}
      title={record ? "결제 기록 취소" : "이 회차를 결제 완료로 기록"}
      style={{
        fontSize: 11, padding: "3px 8px", borderRadius: 8, border: "none",
        cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", fontWeight: 600,
        background: record ? "#E6F6EE" : "#F0EFFE",
        color: record ? "#1D9E75" : "#7F77DD",
      }}
    >
      {record ? "✓ 결제됨" : "결제 완료"}
    </button>
  );
}
