import { ArrowLeft, Globe, Phone, MapPin, Search } from "lucide-react";
import TripSummaryBanner from "./TripSummaryBanner";
import type { FetchedHotel, DinnerOption, TripParameters } from "../../types";

interface DayDiningChoice {
  day_number: number;
  dinner: DinnerOption;
}

interface Props {
  destination: string;
  tripParams: TripParameters;
  userName?: string;
  hotel: FetchedHotel;
  diningChoices: DayDiningChoice[];
  onBack: () => void;
}

export default function BookingScreen({
  destination, tripParams, userName, hotel, diningChoices, onBack,
}: Props) {
  const dest = destination.split(",")[0].trim();
  const mmtUrl = `https://www.makemytrip.com/hotels/hotel-listing/?city=${encodeURIComponent(dest)}&hotelName=${encodeURIComponent(hotel.name)}`;

  return (
    <div className="screen" style={{ minHeight: "unset", paddingBottom: 40 }}>
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
          screen="booking"
          chosenHotelName={hotel.name}
        />

        {/* Hotel booking */}
        <div style={{
          border: "1.5px solid rgba(62,47,35,0.14)",
          borderRadius: 14, padding: "16px", marginBottom: 20,
          background: "var(--surface)",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
            color: "var(--bark-3)", fontFamily: "var(--font-body)",
            textTransform: "uppercase", marginBottom: 10,
          }}>
            Your hotel
          </div>
          <div style={{ fontFamily: "var(--font-script)", fontSize: 22, color: "var(--bark)", marginBottom: 4 }}>
            {hotel.name}
          </div>
          {hotel.rating && (
            <div style={{ fontSize: 12, color: "var(--fg-2)", fontFamily: "var(--font-body)", marginBottom: 6 }}>
              ★ {hotel.rating} · {hotel.address}
            </div>
          )}
          {hotel.why_chosen && (
            <div style={{
              fontFamily: "var(--font-script)", fontSize: 14, color: "var(--bark-2)",
              borderLeft: "3px solid var(--tape)", paddingLeft: 8, marginBottom: 14, lineHeight: 1.4,
            }}>
              {hotel.why_chosen}
            </div>
          )}

          {/* Booking CTAs */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hotel.website_url && (
              <a
                href={hotel.website_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 9,
                  background: "var(--accent)", color: "var(--paper)",
                  fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                  textDecoration: "none",
                }}
              >
                <Globe size={14} strokeWidth={2} />
                Book on their website
              </a>
            )}
            {hotel.phone && (
              <a
                href={`tel:${hotel.phone}`}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "11px 16px", borderRadius: 9,
                  border: "1.5px solid var(--border-strong)", color: "var(--fg)",
                  fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13,
                  textDecoration: "none", background: "var(--surface)",
                }}
              >
                <Phone size={14} strokeWidth={2} />
                {hotel.phone}
              </a>
            )}
            {hotel.maps_url && (
              <a
                href={hotel.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 16px", borderRadius: 9,
                  color: "var(--moss)",
                  fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
                  textDecoration: "none",
                }}
              >
                <MapPin size={13} strokeWidth={2} />
                View on Google Maps
              </a>
            )}
            <a
              href={mmtUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 16px", borderRadius: 9,
                color: "var(--bark-2)",
                fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 12,
                textDecoration: "none",
              }}
            >
              <Search size={13} strokeWidth={2} />
              Search on MakeMyTrip
            </a>
          </div>
        </div>

        {/* Dining choices */}
        {diningChoices.length > 0 && (
          <div style={{
            border: "1.5px solid rgba(62,47,35,0.14)",
            borderRadius: 14, padding: "16px", marginBottom: 20,
            background: "var(--surface)",
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
              color: "var(--bark-3)", fontFamily: "var(--font-body)",
              textTransform: "uppercase", marginBottom: 12,
            }}>
              Your dining picks
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {diningChoices.map(({ day_number, dinner }) => (
                <div key={day_number} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                    border: "2px solid var(--bark-3)",
                    display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontFamily: "var(--font-script)", fontSize: 16, color: "var(--bark)", lineHeight: 1 }}>{day_number}</span>
                    <span style={{ fontSize: 6, fontWeight: 800, letterSpacing: "0.1em", color: "var(--bark-3)" }}>DAY</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 11, marginRight: 2 }}>🍽</span>
                      <span style={{ fontFamily: "var(--font-body)", fontWeight: 700, fontSize: 13, color: "var(--fg)" }}>
                        {dinner.restaurant_name ?? dinner.description.split("—")[0].trim()}
                      </span>
                      {dinner.rating && (
                        <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-body)" }}>★ {dinner.rating}</span>
                      )}
                    </div>
                    {dinner.phone ? (
                      <a
                        href={`tel:${dinner.phone}`}
                        style={{ fontSize: 12, color: "var(--moss)", fontFamily: "var(--font-body)", fontWeight: 700, textDecoration: "none" }}
                      >
                        📞 {dinner.phone}
                      </a>
                    ) : (
                      <div style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--font-body)" }}>
                        {dinner.cuisine_tag === "premium" ? "Call ahead recommended" : "No reservation needed — walk-in"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 14, padding: "8px 10px",
              background: "rgba(216,149,64,0.08)",
              borderLeft: "3px solid var(--ochre)",
              borderRadius: "0 8px 8px 0",
              fontFamily: "var(--font-body)", fontSize: 11, color: "var(--bark-2)",
            }}>
              Lunch stops are en-route — no reservation needed, just stop in as you pass.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
