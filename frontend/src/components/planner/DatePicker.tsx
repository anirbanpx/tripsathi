import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

interface Props {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  placeholder?: string;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function parseDate(val: string): Date | null {
  if (!val) return null;
  const d = new Date(val + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function toISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatDisplay(val: string) {
  const d = parseDate(val);
  if (!d) return null;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function DatePicker({ value, onChange, placeholder = "pick a date" }: Props) {
  const today = new Date();
  const selected = parseDate(value);

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.getFullYear() ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.getMonth() ?? today.getMonth());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build day grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  function selectDay(day: number) {
    const iso = toISO(viewYear, viewMonth, day);
    onChange(iso);
    setOpen(false);
  }

  function isPast(day: number) {
    const d = new Date(viewYear, viewMonth, day);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return d < t;
  }

  function isSelected(day: number) {
    return selected
      ? selected.getFullYear() === viewYear &&
        selected.getMonth() === viewMonth &&
        selected.getDate() === day
      : false;
  }

  function isToday(day: number) {
    return today.getFullYear() === viewYear &&
           today.getMonth() === viewMonth &&
           today.getDate() === day;
  }

  const displayLabel = formatDisplay(value);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", width: "100%" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "12px 14px",
          background: "var(--surface)",
          border: open ? "1.5px solid var(--accent)" : "1.5px dashed var(--border-strong)",
          borderRadius: "var(--radius)", cursor: "pointer",
          fontFamily: "var(--font-body)", fontWeight: 700,
          fontSize: 15, color: displayLabel ? "var(--fg)" : "var(--fg-3)",
          textAlign: "left", transition: "border-color var(--dur-fast)",
        }}
      >
        <CalendarDays size={16} strokeWidth={2} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{displayLabel ?? placeholder}</span>
        {displayLabel && !open && (
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: "0.04em" }}>change</span>
        )}
      </button>

      {/* Calendar — inline (not absolute) so it never clips behind sticky bottom bar */}
      {open && (
        <div style={{
          marginTop: 8,
          background: "var(--surface)", border: "1.5px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)", padding: "16px 14px",
          boxShadow: "var(--shadow-lg)", width: "100%",
          animation: "fadeIn 0.15s ease",
        }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <button type="button" onClick={prevMonth} style={navBtn}>
              <ChevronLeft size={16} strokeWidth={2.5} />
            </button>
            <span style={{ fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14, color: "var(--fg)" }}>
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} style={navBtn}>
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          </div>

          {/* Day labels */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 4 }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 800,
                letterSpacing: "0.08em", color: "var(--fg-3)", padding: "4px 0" }}>
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const past = isPast(day);
              const sel = isSelected(day);
              const tod = isToday(day);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={past}
                  onClick={() => selectDay(day)}
                  style={{
                    width: "100%", aspectRatio: "1", minHeight: 36,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: "var(--radius-sm)",
                    border: tod && !sel ? "1.5px solid var(--accent)" : "1.5px solid transparent",
                    background: sel ? "var(--accent)" : "transparent",
                    color: sel ? "var(--paper)" : past ? "var(--fg-3)" : "var(--fg)",
                    fontFamily: "var(--font-body)", fontWeight: sel ? 800 : 600,
                    fontSize: 14, cursor: past ? "default" : "pointer",
                    opacity: past ? 0.3 : 1,
                    transition: "background var(--dur-fast)",
                  }}
                  onMouseEnter={e => { if (!sel && !past) (e.currentTarget as HTMLButtonElement).style.background = "var(--paper-2)"; }}
                  onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick jump: next few weekends */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
              textTransform: "uppercase", color: "var(--fg-3)", marginBottom: 6 }}>
              quick pick
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {getUpcomingWeekends(today).map(({ label, iso }) => (
                <button key={iso} type="button"
                  onClick={() => { onChange(iso); setOpen(false); }}
                  style={{
                    padding: "4px 10px", borderRadius: "var(--radius-pill)",
                    border: "1.5px solid var(--border-strong)",
                    background: value === iso ? "var(--accent)" : "transparent",
                    color: value === iso ? "var(--paper)" : "var(--fg-2)",
                    fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 11,
                    cursor: "pointer",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: "transparent", border: "none", cursor: "pointer",
  color: "var(--fg-2)", padding: 4, borderRadius: "var(--radius-sm)",
  display: "flex", alignItems: "center",
};

function getUpcomingWeekends(from: Date) {
  const results: { label: string; iso: string }[] = [];
  const d = new Date(from);
  // advance to next Saturday
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  for (let i = 0; i < 3; i++) {
    const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
    const label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    results.push({ label, iso });
    d.setDate(d.getDate() + 7);
  }
  return results;
}
