import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCoordinates, getCenterAndZoom } from "../../lib/destinationCoordinates";
import type { DayPlan, Hotel } from "../../types";

// Fix Leaflet's broken default icon paths in Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function dayIcon(n: number) {
  return L.divIcon({
    html: `<div style="
      width:30px;height:30px;border-radius:50%;
      background:#B0492F;color:#F4ECDB;
      display:flex;align-items:center;justify-content:center;
      font-family:Nunito,sans-serif;font-weight:800;font-size:12px;
      border:2.5px solid #F4ECDB;
      box-shadow:0 2px 8px rgba(62,47,35,0.35);
    ">${n}</div>`,
    className: "",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

const hotelIcon = L.divIcon({
  html: `<div style="
    width:24px;height:24px;border-radius:6px;
    background:#4F6B4A;color:#F4ECDB;
    display:flex;align-items:center;justify-content:center;
    font-size:12px;border:2px solid #F4ECDB;
    box-shadow:0 2px 6px rgba(62,47,35,0.3);
  ">H</div>`,
  className: "",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
  popupAnchor: [0, -14],
});

function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [40, 40], maxZoom: 11 });
    } else if (coords.length === 1) {
      map.setView(coords[0], 10);
    }
  }, []);
  return null;
}

interface Props {
  days: DayPlan[];
  hotels: Hotel[];
}

export default function MapView({ days, hotels }: Props) {
  // Deduplicate day locations for the route line
  const dayCoords: Array<{ coord: [number, number]; day: DayPlan }> = [];
  const seen = new Set<string>();
  for (const day of days) {
    const coord = getCoordinates(day.location);
    if (coord) {
      const key = coord.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        dayCoords.push({ coord, day });
      }
    }
  }

  const hotelCoords = hotels
    .map(h => ({ coord: getCoordinates(h.location), hotel: h }))
    .filter((x): x is { coord: [number, number]; hotel: Hotel } => x.coord !== null);

  const allCoords = [...dayCoords.map(d => d.coord), ...hotelCoords.map(h => h.coord)];
  const { center } = getCenterAndZoom(days.map(d => d.location));

  return (
    <div style={{ borderRadius: 18, overflow: "hidden", border: "1.5px solid var(--border)", boxShadow: "0 2px 0 0 rgba(62,47,35,.1), 0 10px 28px -16px rgba(62,47,35,.28)" }}>
      <MapContainer
        center={center}
        zoom={8}
        style={{ height: 380, width: "100%" }}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />

        <FitBounds coords={allCoords} />

        {/* Route line */}
        {dayCoords.length > 1 && (
          <Polyline
            positions={dayCoords.map(d => d.coord)}
            pathOptions={{ color: "#B0492F", weight: 2.5, dashArray: "6 6", opacity: 0.75 }}
          />
        )}

        {/* Day markers */}
        {dayCoords.map(({ coord, day }, i) => (
          <Marker key={day.day_number} position={coord} icon={dayIcon(i + 1)}>
            <Popup>
              <div style={{ fontFamily: "Nunito, sans-serif", minWidth: 180 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#B0492F", marginBottom: 2 }}>
                  Day {day.day_number} · {day.location}
                </div>
                {day.activities.slice(0, 3).map(a => (
                  <div key={a.name} style={{ fontSize: 12, color: "#3E2F23", padding: "2px 0", borderBottom: "1px dashed #e5d2b0" }}>
                    {a.name}
                  </div>
                ))}
                {day.activities.length > 3 && (
                  <div style={{ fontSize: 11, color: "#9A8775", marginTop: 4 }}>
                    +{day.activities.length - 3} more
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Hotel markers */}
        {hotelCoords.map(({ coord, hotel }) => (
          <Marker key={hotel.name} position={coord} icon={hotelIcon}>
            <Popup>
              <div style={{ fontFamily: "Nunito, sans-serif", minWidth: 160 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: "#4F6B4A" }}>{hotel.name}</div>
                <div style={{ fontSize: 11, color: "#6B5A4A", marginTop: 2 }}>{hotel.location}</div>
                <div style={{ fontSize: 12, color: "#B0492F", marginTop: 4, fontWeight: 700 }}>
                  ~₹{hotel.approx_cost_per_night.toLocaleString()} / night
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {allCoords.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper-2)", fontFamily: "var(--font-body)", color: "var(--fg-3)", fontSize: 13, fontWeight: 600 }}>
          no coordinates found for these locations
        </div>
      )}
    </div>
  );
}
