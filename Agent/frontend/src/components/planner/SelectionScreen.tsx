import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import TripSummaryBanner from "./TripSummaryBanner";
import type { FetchedHotel, LunchMeal, DinnerOption, TripParameters } from "../../types";

interface DayPlacesData {
  day_number: number;
  lunch: LunchMeal;
  dinner: DinnerOption[];
}

interface Props {
  destination: string;
  tripParams: TripParameters;
  userName?: string;
  fetchedHotels: FetchedHotel[];
  daysPlaces: DayPlacesData[];
  onBack: () => void;
  onConfirm: (hotel: FetchedHotel, dinnerChoices: Record<number, DinnerOption>) => void;
}

const CUISINE_LABELS: Record<string, string> = {
  local: "Local",
  family: "Family",
  premium: "Splurge",
};

export default function SelectionScreen({
  destination, tripParams, userName, fetchedHotels, daysPlaces, onBack, onConfirm,
}: Props) {
  const [selectedHotel, setSelectedHotel] = useState<FetchedHotel | null>(null);
  const [dinnerChoices, setDinnerChoices] = useState<Record<number, number>>(() => {
    // Default: first option (local) for each day
    const defaults: Record<number, number> = {};
    daysPlaces.forEach(d => { defaults[d.day_number] = 0; });
    return defaults;
  });

  function handleConfirm() {
    if (!selectedHotel) return;
    const choices: Record<number, DinnerOption> = {};
    daysPlaces.forEach(d => {
      const idx = dinnerChoices[d.day_number] ?? 0;
      choices[d.day_number] = d.dinner[idx] ?? d.dinner[0];
    });
    onConfirm(selectedHotel, choices);
  }

  return (
    <div className="screen" style={{ minHeight: "unset", paddingBottom: 100 }}>
      <div className="topbar">
        <button className="back" onClick={onBack}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div className="brand-mini"><span className="word">trip<i>sathi</i></span></div>
        <div />
      </div>

      <div className="cx">
        <TripSummaryBanner
          destination={destination}
          tripParams={tripParams}
          userName={userName}
          screen="selection"
        />

        {/* Hotels */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
            color: "var(--bark-3)", fontFamily: "var(--font-body)",
            textTransform: "uppercase", marginBottom: 12,
          }}>
            Choose your hotel
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fetchedHotels.map((hotel, i) => {
              const selected = selectedHotel?.name === hotel.name;
              return (
                <button
                  key={hotel.name + i}
                  onClick={() => setSelectedHotel(hotel)}
                  style={{
                    textAlign: "left", width: "100%", padding: "12px 14px",
                    border: `2px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 12,
                    background: selected ? "rgba(176,73,47,0.06)" : "var(--surface)",
                    cursor: "pointer",
                    boxShadow: selected ? "0 0 0 3px rgba(176,73,47,0.12)" : "none",
                    transition: "all 0.18s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: "var(--font-script)", fontSize: 18, color: "var(--bark)",
                        lineHeight: 1.2, marginBottom: 4,
                      }}>
                        {hotel.name}
                      </div>
                      {hotel.rating && (
                        <div style={{ fontSize: 11, color: "var(--fg-2)", fontFamily: "var(--font-body)", marginBottom: 4 }}>
                          ★ {hotel.rating} · {hotel.address}
                        </div>
                      )}
                      {hotel.why_chosen && (
                        <div style={{
                          fontFamily: "var(--font-script)", fontSize: 13,
                          color: "var(--bark-2)", lineHeight: 1.4,
                          borderLeft: "3px solid var(--tape)", paddingLeft: 8,
                        }}>
                          {hotel.why_chosen}
                        </div>
                      )}
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                      border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
                      background: selected ? "var(--accent)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--paper)" }} />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Per-day dinner */}
        {daysPlaces.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, letterSpacing: "0.12em",
              color: "var(--bark-3)", fontFamily: "var(--font-body)",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              Choose dinner — day by day
            </div>
            {daysPlaces.map(d => (
              <div key={d.day_number} style={{ marginBottom: 16 }}>
                <div style={{
                  fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
                  color: "var(--fg-2)", marginBottom: 8,
                }}>
                  Day {d.day_number}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.dinner.map((opt, idx) => {
                    const chosen = (dinnerChoices[d.day_number] ?? 0) === idx;
                    return (
                      <button
                        key={opt.cuisine_tag}
                        onClick={() => setDinnerChoices(prev => ({ ...prev, [d.day_number]: idx }))}
                        style={{
                          textAlign: "left", padding: "10px 12px",
                          border: `1.5px solid ${chosen ? "var(--moss)" : "var(--border)"}`,
                          borderRadius: 10,
                          background: chosen ? "rgba(79,107,74,0.07)" : "var(--surface)",
                          cursor: "pointer", transition: "all 0.15s ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                            border: `2px solid ${chosen ? "var(--moss)" : "var(--border-strong)"}`,
                            background: chosen ? "var(--moss)" : "transparent",
                          }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, padding: "1px 7px",
                                borderRadius: 8,
                                background: opt.cuisine_tag === "local" ? "var(--ochre)" : opt.cuisine_tag === "premium" ? "var(--rust)" : "transparent",
                                color: opt.cuisine_tag === "local" || opt.cuisine_tag === "premium" ? "var(--paper)" : "var(--fg-2)",
                                border: opt.cuisine_tag === "family" ? "1.5px solid var(--border-strong)" : "none",
                                fontFamily: "var(--font-body)",
                              }}>
                                {CUISINE_LABELS[opt.cuisine_tag] ?? opt.cuisine_tag}
                              </span>
                              {opt.restaurant_name && (
                                <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12, color: "var(--fg)" }}>
                                  {opt.restaurant_name}
                                  {opt.rating ? ` · ★${opt.rating}` : ""}
                                </span>
                              )}
                            </div>
                            <div style={{ fontFamily: "var(--font-script)", fontSize: 12, color: "var(--bark-2)", lineHeight: 1.3 }}>
                              {opt.description}
                            </div>
                            {opt.phone && (
                              <a
                                href={`tel:${opt.phone}`}
                                onClick={e => e.stopPropagation()}
                                style={{
                                  display: "inline-block", marginTop: 4,
                                  fontSize: 10, fontWeight: 700, color: "var(--moss)",
                                  fontFamily: "var(--font-body)", textDecoration: "none",
                                }}
                              >
                                📞 {opt.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky confirm bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "12px 16px", background: "var(--paper)",
        borderTop: "1.5px solid var(--border)",
        boxShadow: "0 -4px 20px rgba(62,47,35,0.1)",
        zIndex: 100,
      }}>
        <button
          onClick={handleConfirm}
          disabled={!selectedHotel}
          style={{
            width: "100%", padding: "13px 0",
            background: selectedHotel ? "var(--accent)" : "var(--surface)",
            color: selectedHotel ? "var(--paper)" : "var(--fg-3)",
            border: `1.5px solid ${selectedHotel ? "var(--accent)" : "var(--border)"}`,
            borderRadius: 10, cursor: selectedHotel ? "pointer" : "not-allowed",
            fontFamily: "var(--font-body)", fontWeight: 800, fontSize: 14,
            letterSpacing: "0.02em", transition: "all 0.2s ease",
          }}
        >
          {selectedHotel ? "Confirm & Proceed to Booking →" : "Select a hotel to continue"}
        </button>
      </div>
    </div>
  );
}
