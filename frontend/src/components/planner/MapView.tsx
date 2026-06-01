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

// Per-day leg colors cycling through the Wanderkin palette
const LEG_COLORS = ["#B0492F", "#D89540", "#4F6B4A", "#6B5A4A", "#843521", "#A6701D", "#364B33"];
const legColor = (i: number) => LEG_COLORS[i % LEG_COLORS.length];

export interface Props {
  days: DayPlan[];
  hotels: Hotel[];
  selectedDay?: number; // 0 = all, 1-N = specific day
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function haversineDist(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function driveTime(km: number): string {
  const hrs = km / 45;
  if (hrs < 1) return `~${Math.round(hrs * 60)} min`;
  return `~${hrs % 1 < 0.15 ? Math.round(hrs) : hrs.toFixed(1)} hr`;
}

function midLngLat(a: [number, number], b: [number, number]): [number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// ── Marker elements ───────────────────────────────────────────────────────────

function stopEl(n: number, color: string, active: boolean, dimmed: boolean): HTMLDivElement {
  const el = document.createElement("div");
  const size = active ? 40 : dimmed ? 28 : 34;
  const opacity = dimmed ? 0.35 : 1;
  el.style.cssText = `
    width:${size}px;height:${size}px;border-radius:50%;
    background:${dimmed ? "rgba(62,47,35,0.25)" : color};
    color:${PAPER};
    display:flex;align-items:center;justify-content:center;
    font-family:Nunito,sans-serif;font-weight:900;font-size:${active ? 15 : 12}px;
    border:${active ? 3.5 : 2.5}px solid ${dimmed ? "rgba(244,236,219,0.4)" : PAPER};
    box-shadow:0 ${active ? 6 : 3}px ${active ? 20 : 10}px rgba(62,47,35,${dimmed ? 0.1 : active ? 0.5 : 0.3});
    cursor:pointer;letter-spacing:-0.02em;
    transition:all 0.35s cubic-bezier(.22,1,.36,1);
    opacity:${opacity};
    ${active ? "transform:scale(1.1);" : ""}
  `;
  el.textContent = String(n);

  if (active) {
    // inject a simple CSS pulse ring via a sibling div
    const ring = document.createElement("div");
    ring.style.cssText = `
      position:absolute;inset:-6px;border-radius:50%;
      border:2px solid ${color};opacity:0;
      animation:mapPulse 1.6s ease-out infinite;
      pointer-events:none;
    `;
    el.style.position = "relative";
    el.appendChild(ring);
    injectPulseKeyframes();
  }
  return el;
}

let pulseInjected = false;
function injectPulseKeyframes() {
  if (pulseInjected) return;
  pulseInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    @keyframes mapPulse {
      0%   { transform:scale(1);   opacity:0.7; }
      100% { transform:scale(2.2); opacity:0; }
    }
  `;
  document.head.appendChild(style);
}

function hotelEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    width:30px;height:30px;border-radius:8px;
    background:${OCHRE};color:${PAPER};
    display:flex;align-items:center;justify-content:center;
    font-size:14px;border:2px solid ${PAPER};
    box-shadow:0 3px 10px rgba(62,47,35,0.3);
    cursor:pointer;
  `;
  el.textContent = "🏨";
  return el;
}

function timePillEl(text: string, highlight: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `
    padding:3px 9px;border-radius:20px;
    background:${highlight ? RUST : PAPER};
    color:${highlight ? PAPER : BARK};
    font-family:Nunito,sans-serif;font-weight:800;font-size:10px;
    border:1.5px solid rgba(62,47,35,${highlight ? 0 : 0.18});
    box-shadow:0 2px 6px rgba(62,47,35,${highlight ? 0.3 : 0.12});
    white-space:nowrap;pointer-events:none;letter-spacing:0.02em;
    opacity:${highlight ? 1 : 0.65};
    transition:all 0.3s ease;
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

  // Deduplicated ordered stop list
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

      // Clear previous markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      // Clear previous route layers/sources
      const layerIds = map.getStyle()?.layers?.map(l => l.id) ?? [];
      layerIds.filter(id => id.startsWith("route-")).forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      const sourceIds = Object.keys((map.getStyle() as mapboxgl.Style & { sources: Record<string, unknown> })?.sources ?? {});
      sourceIds.filter(id => id.startsWith("route-")).forEach(id => {
        if (map.getSource(id)) map.removeSource(id);
      });

      // Find focused stop index for the selected day
      const focusedIdx = selectedDay !== 0
        ? allStops.findIndex(s => s.days.some(d => d.day_number === selectedDay))
        : -1;

      // ── Route: one FeatureCollection, data-driven opacity/color ───────────
      // Build per-segment features (each segment = one leg between consecutive stops)
      const segFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];
      for (let i = 0; i < allStops.length - 1; i++) {
        const from = allStops[i].lngLat;
        const to   = allStops[i + 1].lngLat;
        const isActiveLeg = selectedDay === 0
          || focusedIdx === i + 1  // the leg arriving at focusedStop
          || (focusedIdx === i && i === allStops.length - 1); // last stop
        segFeatures.push({
          type: "Feature",
          properties: {
            color:  legColor(i),
            active: isActiveLeg,
          },
          geometry: { type: "LineString", coordinates: [from, to] },
        });
      }

      if (segFeatures.length) {
        map.addSource("route-segs", {
          type: "geojson",
          data: { type: "FeatureCollection", features: segFeatures },
        });
        // Glow layer (wide, low opacity)
        map.addLayer({
          id: "route-glow",
          type: "line",
          source: "route-segs",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "active"], 12, 4],
            "line-opacity": ["case", ["get", "active"], 0.18, 0.04],
            "line-blur": 6,
          },
        });
        // Main line (dashed when inactive, solid when active)
        map.addLayer({
          id: "route-line",
          type: "line",
          source: "route-segs",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", ["get", "active"], 3.5, 1.5],
            "line-opacity": ["case", ["get", "active"], 0.95, 0.2],
            "line-dasharray": ["case", ["get", "active"], ["literal", [1, 0]], ["literal", [3, 4]]],
          },
        });
      }

      // ── Stop markers ───────────────────────────────────────────────────────
      allStops.forEach(({ lngLat, days: stopDays, idx }) => {
        const isActive = selectedDay !== 0 && focusedIdx === idx - 1;
        const dimmed   = selectedDay !== 0 && !isActive;
        const color    = legColor(idx - 1);
        const el = stopEl(idx, color, isActive, dimmed);

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

        const popup = new mapboxgl.Popup({ offset: 20, closeButton: false, maxWidth: "240px" })
          .setHTML(popupHtml(label, actRows, color));

        const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat(lngLat)
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => {
          map.flyTo({ center: lngLat, zoom: 12, speed: 1.0, curve: 1.4 });
          marker.togglePopup();
        });
        markersRef.current.push(marker);
      });

      // ── Travel time pills between consecutive stops ──────────────────────
      for (let i = 0; i < allStops.length - 1; i++) {
        const a = allStops[i];
        const b = allStops[i + 1];
        const dist = haversineDist([a.lngLat[1], a.lngLat[0]], [b.lngLat[1], b.lngLat[0]]);
        if (dist < 5) continue;
        const isActiveLeg = selectedDay === 0 || focusedIdx === i + 1;
        const mid = midLngLat(a.lngLat, b.lngLat);
        const pill = timePillEl(driveTime(dist), isActiveLeg);
        markersRef.current.push(
          new mapboxgl.Marker({ element: pill, anchor: "center" }).setLngLat(mid).addTo(map)
        );
      }

      // ── Hotel markers ─────────────────────────────────────────────────────
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
          map.flyTo({ center: lngLat, zoom: 13, speed: 1.0, curve: 1.4 });
          marker.togglePopup();
        });
        markersRef.current.push(marker);
      });

      // ── Camera: cinematic flyTo for the focused leg ───────────────────────
      if (selectedDay !== 0 && focusedIdx >= 0) {
        const dest = allStops[focusedIdx];
        const prev = focusedIdx > 0 ? allStops[focusedIdx - 1] : null;

        if (prev && prev.lngLat[0] !== dest.lngLat[0]) {
          // Fit the leg's two endpoints; remove maxZoom cap so it zooms into city level
          const bounds = new mapboxgl.LngLatBounds(prev.lngLat, dest.lngLat);
          bounds.extend(dest.lngLat);
          map.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 60, right: 60 },
            maxZoom: 13,
            duration: 1100,
            essential: true,
          });
        } else {
          // Single location — zoom into destination
          map.flyTo({ center: dest.lngLat, zoom: 12.5, speed: 0.9, curve: 1.4, duration: 1100 });
        }
      } else if (selectedDay === 0) {
        // All stops — fit full trip
        if (allStops.length === 1) {
          map.flyTo({ center: allStops[0].lngLat, zoom: 11, speed: 0.9, duration: 900 });
        } else if (allStops.length > 1) {
          const bounds = allStops.reduce(
            (b, s) => b.extend(s.lngLat),
            new mapboxgl.LngLatBounds(allStops[0].lngLat, allStops[0].lngLat),
          );
          map.fitBounds(bounds, { padding: { top: 50, bottom: 50, left: 40, right: 40 }, maxZoom: 11, duration: 900 });
        }
      }
    }

    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, days, hotels]);

  return (
    <div style={{ width: "100%", height: "100%", borderRadius: "inherit", overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
