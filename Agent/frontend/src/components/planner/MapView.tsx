import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getCoordinates, getCenterAndZoom } from "../../lib/destinationCoordinates";
import type { DayPlan, Hotel } from "../../types";

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

const BARK  = "#3E2F23";
const PAPER = "#F4ECDB";
const RUST  = "#B0492F";
const OCHRE = "#B45309";

const ROUTE_SRC  = "route-src";
const ROUTE_GLOW = "route-glow";
const ROUTE_LINE = "route-line";

export interface Props {
  days: DayPlan[];
  hotels: Hotel[];
  selectedDay?: number; // 0 = all, 1-N = specific day
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function driveTime(km: number): string {
  const hrs = km / 45;
  if (hrs < 1) return `~${Math.round(hrs * 60)} min`;
  return `~${hrs % 1 < 0.15 ? Math.round(hrs) : hrs.toFixed(1)} hr`;
}

function midLngLat(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// ── Marker elements ───────────────────────────────────────────────────────────

function stopEl(n: number, dimmed: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width:34px;height:34px;border-radius:50%;
    background:${dimmed ? "rgba(176,73,47,0.45)" : RUST};
    color:${PAPER};
    display:flex;align-items:center;justify-content:center;
    font-family:Nunito,sans-serif;font-weight:900;font-size:13px;
    border:3px solid ${dimmed ? "rgba(244,236,219,0.6)" : PAPER};
    box-shadow:0 3px 12px rgba(62,47,35,${dimmed ? 0.15 : 0.4});
    cursor:pointer;letter-spacing:-0.02em;
    transition:all 0.2s ease;
  `;
  el.textContent = String(n);
  return el;
}

function hotelEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width:32px;height:32px;border-radius:9px;
    background:${OCHRE};color:${PAPER};
    display:flex;align-items:center;justify-content:center;
    font-size:15px;border:2.5px solid ${PAPER};
    box-shadow:0 3px 10px rgba(62,47,35,0.35);
    cursor:pointer;
  `;
  el.textContent = "🏨";
  return el;
}

function timePillEl(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    padding:3px 9px;border-radius:20px;
    background:${PAPER};color:${BARK};
    font-family:Nunito,sans-serif;font-weight:800;font-size:10px;
    border:1.5px solid rgba(62,47,35,0.2);
    box-shadow:0 2px 6px rgba(62,47,35,0.15);
    white-space:nowrap;pointer-events:none;letter-spacing:0.02em;
  `;
  el.textContent = text;
  return el;
}

function popupHtml(title: string, rows: string[], accent: string): string {
  return `
    <div style="font-family:Nunito,sans-serif;min-width:190px;max-width:230px;
      border-left:4px solid ${accent};padding-left:10px">
      <div style="font-weight:900;font-size:11px;color:${accent};
        letter-spacing:0.07em;text-transform:uppercase;margin-bottom:6px">
        ${title}
      </div>
      ${rows.map(r => `
        <div style="font-size:12px;color:${BARK};font-weight:600;
          padding:3px 0;border-bottom:1px dashed rgba(62,47,35,0.1);line-height:1.4">
          ${r}
        </div>`).join("")}
    </div>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MapView({ days, hotels, selectedDay = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const markersRef   = useRef<mapboxgl.Marker[]>([]);

  // Deduplicated ordered stop list (computed once per days change)
  const allStops = (() => {
    const seen = new Set<string>();
    const out: Array<{ lngLat: [number, number]; days: DayPlan[]; idx: number }> = [];
    for (const day of days) {
      const c = getCoordinates(day.location);
      if (!c) continue;
      const key = `${c[0].toFixed(2)},${c[1].toFixed(2)}`;
      const existing = out.find(s => {
        const [slat, slng] = [s.lngLat[1], s.lngLat[0]];
        return `${slat.toFixed(2)},${slng.toFixed(2)}` === key;
      });
      if (existing) { existing.days.push(day); }
      else if (!seen.has(key)) {
        seen.add(key);
        out.push({ lngLat: [c[1], c[0]], days: [day], idx: out.length + 1 });
      }
    }
    return out;
  })();

  if (!TOKEN || TOKEN === "your_mapbox_token_here") {
    return (
      <div style={{
        height: "100%", borderRadius: 16, overflow: "hidden",
        border: "1.5px solid rgba(62,47,35,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", gap: 8, background: "var(--paper-2)",
        fontFamily: "var(--font-body)",
      }}>
        <div style={{ fontSize: 28 }}>🗺️</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--fg-1)" }}>Map unavailable</div>
        <div style={{ fontSize: 11, color: "var(--fg-3)", textAlign: "center", maxWidth: 220 }}>
          Add <code style={{ background: "var(--paper-3)", padding: "1px 4px", borderRadius: 4 }}>VITE_MAPBOX_TOKEN</code> to .env.local
        </div>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = TOKEN!;
    const { center } = getCenterAndZoom(days.map(d => d.location));
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/outdoors-v12",
      center: [center[1], center[0]],
      zoom: 7,
      scrollZoom: false,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-left");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function render() {
      const map = mapRef.current!;

      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (map.getLayer(ROUTE_LINE)) map.removeLayer(ROUTE_LINE);
      if (map.getLayer(ROUTE_GLOW)) map.removeLayer(ROUTE_GLOW);
      if (map.getSource(ROUTE_SRC))  map.removeSource(ROUTE_SRC);

      // Which stops are "in focus" for this selected day
      const focusedStop = selectedDay !== 0
        ? allStops.find(s => s.days.some(d => d.day_number === selectedDay))
        : null;

      // ── Stop markers (always show all) ──────────────────────────────────
      allStops.forEach(({ lngLat, days: stopDays, idx }) => {
        const dimmed = focusedStop !== null && focusedStop !== allStops[idx - 1];
        const el = stopEl(idx, dimmed);

        const label = stopDays.map(d => `Day ${d.day_number}`).join(" & ")
          + ` · ${stopDays[0].location.split(",")[0]}`;
        const actRows = stopDays.flatMap(d => d.activities.slice(0, 3).map(a =>
          a.approx_cost != null
            ? `${a.name} <span style="color:${RUST};font-weight:700">~₹${a.approx_cost.toLocaleString()}</span>`
            : a.name
        ));
        if (stopDays.flatMap(d => d.activities).length > actRows.length) {
          actRows.push(`<span style="color:rgba(62,47,35,0.4);font-size:11px">+ more stops</span>`);
        }

        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false, maxWidth: "240px" })
          .setHTML(popupHtml(label, actRows, RUST));

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => {
          map.flyTo({ center: lngLat, zoom: 12, speed: 1.1, curve: 1.4 });
          marker.togglePopup();
        });

        markersRef.current.push(marker);
      });

      // ── Travel time pills between consecutive stops ──────────────────────
      for (let i = 0; i < allStops.length - 1; i++) {
        const a = allStops[i];
        const b = allStops[i + 1];
        // Skip pill if either stop is dimmed (different day in focus)
        if (focusedStop && focusedStop !== a && focusedStop !== b) continue;
        const dist = haversineDist([a.lngLat[1], a.lngLat[0]], [b.lngLat[1], b.lngLat[0]]);
        if (dist < 5) continue;
        const mid = midLngLat(a.lngLat, b.lngLat);
        const pill = timePillEl(driveTime(dist));
        markersRef.current.push(
          new mapboxgl.Marker({ element: pill, anchor: "center" }).setLngLat(mid).addTo(map)
        );
      }

      // ── Hotel markers ────────────────────────────────────────────────────
      hotels.forEach(hotel => {
        const c = getCoordinates(hotel.location);
        if (!c) return;
        const lngLat: [number, number] = [c[1], c[0]];
        const el = hotelEl();
        const popup = new mapboxgl.Popup({ offset: 18, closeButton: false, maxWidth: "220px" })
          .setHTML(popupHtml(
            hotel.name,
            [hotel.location, `~₹${hotel.approx_cost_per_night.toLocaleString()} / night`],
            OCHRE,
          ));
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);
        el.addEventListener("click", () => {
          map.flyTo({ center: lngLat, zoom: 13, speed: 1.1, curve: 1.4 });
          marker.togglePopup();
        });
        markersRef.current.push(marker);
      });

      // ── Route ────────────────────────────────────────────────────────────
      const routeCoords = focusedStop
        ? allStops
            .filter((_, i) => {
              // include the stop before and the focused stop to draw partial route
              const fi = allStops.indexOf(focusedStop);
              return i <= fi;
            })
            .map(s => s.lngLat)
        : allStops.map(s => s.lngLat);

      if (routeCoords.length > 1) {
        map.addSource(ROUTE_SRC, {
          type: "geojson",
          data: { type: "Feature", geometry: { type: "LineString", coordinates: routeCoords }, properties: {} },
        });
        map.addLayer({
          id: ROUTE_GLOW, type: "line", source: ROUTE_SRC,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": RUST, "line-width": 8, "line-opacity": 0.15, "line-blur": 5 },
        });
        map.addLayer({
          id: ROUTE_LINE, type: "line", source: ROUTE_SRC,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": RUST, "line-width": 2.5, "line-dasharray": [3, 4], "line-opacity": 0.9 },
        });
      }

      // ── Fit bounds ───────────────────────────────────────────────────────
      const target = focusedStop ? [focusedStop] : allStops;
      if (target.length === 1) {
        map.flyTo({ center: target[0].lngLat, zoom: 11, speed: 1.0, duration: 900 });
      } else if (target.length > 1) {
        const bounds = target.reduce(
          (b, s) => b.extend(s.lngLat),
          new mapboxgl.LngLatBounds(target[0].lngLat, target[0].lngLat),
        );
        map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 40, right: 40 }, maxZoom: 11, duration: 900 });
      }
    }

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, days, hotels]);

  return (
    <div style={{
      width: "100%", height: "100%", borderRadius: 16, overflow: "hidden",
      boxShadow: "0 2px 0 rgba(62,47,35,.06), 0 12px 28px -14px rgba(62,47,35,.22)",
    }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
