import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PROGRESS_STAGES } from "../../lib/fakeProgress";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import { getCoordinates, getRouteWaypoints } from "../../lib/destinationCoordinates";
import type { TripParameters } from "../../types";

interface Props {
  stageIndex: number;
  stageLabel: string;
  destination?: string;
  tripParams?: TripParameters | null;
}

interface JournalLine {
  id: number;
  full: string;
  shown: string;
  complete: boolean;
}

// ── Personalization helpers ───────────────────────────────────────────────────

function personaLabel(p: TripParameters | null | undefined): string {
  if (!p) return "your group";
  const { party_size: ps, kid_ages: ka, elderly: el } = p;
  const toddler = ka?.some(a => a <= 3);
  const kids = ka?.length ?? 0;
  if (toddler) return `${ps} adults + a ${ka![0]}-year-old`;
  if (kids > 0) return `family of ${ps + kids}`;
  if (el) return `relaxed group of ${ps}`;
  if (ps === 1) return "solo traveller";
  if (ps === 2) return "a duo";
  return `group of ${ps}`;
}

function journalLines(stage: string, p: TripParameters | null | undefined, destination: string): string[] {
  const dest = destination.split(",")[0].trim();
  const dk = dest.toLowerCase();
  const toddler = p?.kid_ages?.some(a => a <= 3) ?? false;
  const hasKids = (p?.kid_ages?.length ?? 0) > 0;
  const elderly = p?.elderly ?? false;
  const budget = p?.budget_bracket ?? "mid";
  const styles = p?.trip_style ?? [];
  const nights = p?.duration_days ?? 5;
  const ps = p?.party_size ?? 2;
  const sl = stage.toLowerCase();

  if (sl.includes("understanding") || sl.includes("profile")) {
    const lines: string[] = [];
    if (toddler)       lines.push(`Toddler mode activated — midday rest windows locked into every day`);
    else if (hasKids)  lines.push(`Family pace set — 2–3 activities per day, kid-safe meals at each stop`);
    else if (elderly)  lines.push(`Comfort-first routing — shorter drives, midday rest, accessible stays`);
    else if (ps === 1) lines.push(`Solo traveller profile — full flexibility, single-room stays prioritised`);
    else               lines.push(`${ps} travellers → preferences locked in ✦`);
    if (budget === "budget")  lines.push(`Budget-smart lens: maximising value, avoiding tourist-trap pricing`);
    else if (budget === "premium") lines.push(`Premium curation mode — boutique properties and curated experiences`);
    else               lines.push(`Mid-range calibration: quality stays without the splurge — ${dest}'s sweet spot`);
    const s = styles[0];
    if (s === "adventure") lines.push(`Adventure filter on — trekking, water sports, outdoor experiences prioritised`);
    else if (s === "culture") lines.push(`Cultural immersion mode — temples, cuisine, living heritage in ${dest}`);
    else if (s === "nature")  lines.push(`Nature focus — landscapes, wildlife, slow mornings in ${dest}`);
    else if (s === "relaxed") lines.push(`Slow travel pace — unhurried days, fewer spots covered better`);
    return lines;
  }

  if (sl.includes("research") || sl.includes("logistics")) {
    if (dk.includes("kerala")||dk.includes("munnar")||dk.includes("alleppey")||dk.includes("kochi")) {
      const l = [`Reading Kerala's backwater routes, hill stations, and family homestays...`];
      if (toddler)     l.push(`Flagging: overnight houseboats unsafe for under-3s — day cruise substitution queued`);
      else if (hasKids)l.push(`Filtering activity list for family-friendly pace and mealtimes`);
      l.push(`Checking June monsoon windows — afternoon rain buffer built into each day`);
      return l;
    }
    if (dk.includes("goa")) {
      const l = [`Mapping Goa's north–south split: heritage, beach, and quiet south coast`];
      if (hasKids||elderly) l.push(`South Goa bias — quieter beaches, family-safe dining, less crowded`);
      else l.push(`North Goa mix — Fontainhas heritage, Anjuna market, Baga energy`);
      l.push(`Checking Portuguese architecture trail and top seafood spots`);
      return l;
    }
    if (dk.includes("rajasthan")||dk.includes("jaipur")||dk.includes("jodhpur")||dk.includes("jaisalmer")||dk.includes("udaipur")) {
      const l = [`Reading Rajasthan's desert route — palaces, forts, and the golden dunes of Thar`];
      if (hasKids) l.push(`Kid filter: camel rides, puppet shows, fort interactive zones flagged`);
      else if (elderly) l.push(`AC transport verified between cities — Rajasthan summer heat is serious`);
      l.push(`Checking heritage hotel availability along the Golden Triangle–Thar arc`);
      return l;
    }
    if (dk.includes("ladakh")||dk.includes("leh")) {
      const l = [`Reading Ladakh altitude data — acclimatisation day is non-negotiable`];
      if (elderly) l.push(`Altitude advisory: day 1 and 2 strictly rest-only at Leh (3,500m)`);
      else l.push(`Acclimatisation schedule blocked — no altitude gain on first two days`);
      l.push(`Pangong → Nubra arc checked — inner line permit requirement flagged`);
      return l;
    }
    if (dk.includes("manali")) {
      const l = [`Reading Manali's arc: Solang Valley snow fields and Rohtang high pass`];
      if (hasKids) l.push(`Snow activity zones: Solang preferred over Rohtang — less crowded for kids`);
      l.push(`Rohtang permit: required, books out 48 hrs ahead — flagged for pre-booking`);
      return l;
    }
    if (dk.includes("coorg")||dk.includes("kodagu")) {
      const l = [`Reading Coorg's coffee estate belt, waterfall circuit, and elephant camps`];
      l.push(`Estate homestays fill fast — early booking strongly recommended`);
      if (styles.includes("nature")) l.push(`Dubare elephant camp and Nagarhole reserve flagged`);
      return l;
    }
    if (dk.includes("guwahati")||dk.includes("kaziranga")) {
      const l = [`Reading Guwahati–Kaziranga–Shillong arc and Kamakhya darshan timing`];
      if (elderly) l.push(`Flagged: Shillong day return can run late — early Guwahati dinner at risk`);
      l.push(`Kaziranga jeep safari: dawn slot (6 AM) pre-booking strongly recommended`);
      return l;
    }
    if (dk.includes("puri")||dk.includes("bhubaneswar")) {
      const l = [`Reading Puri's Jagannath temple protocol and Chilika lake routing`];
      if (elderly) l.push(`Senior darshan queue available — morning slot before 8 AM preferred`);
      l.push(`Chilika boat operators: private bookings inflate 40% — hotel-arranged route recommended`);
      return l;
    }
    if (dk.includes("darjeeling")) {
      const l = [`Reading Darjeeling's tea estate circuit and Tiger Hill sunrise logistics`];
      l.push(`Tiger Hill 4 AM taxi: pre-book through hotel — independent cabs unreliable at that hour`);
      if (elderly) l.push(`Toy Train seated option flagged — less walking, same scenic experience`);
      return l;
    }
    if (dk.includes("varanasi")||dk.includes("banaras")||dk.includes("kashi")) {
      const l = [`Reading Varanasi's ghat schedule — Ganga Aarti timing is experience-critical`];
      l.push(`Boat at dawn: 5:30 AM ghat row is the best hour — book the evening before`);
      if (hasKids) l.push(`Sarnath Buddhist circuit added — more manageable for kids than the main ghats`);
      return l;
    }
    if (dk.includes("andaman")) {
      const l = [`Reading Andaman's island arc — Port Blair → Havelock → Neil routing`];
      l.push(`Radhanagar Beach: sunrise visit recommended — crowds build rapidly after 9 AM`);
      l.push(`Govt ferry pre-booking: sells out 3–5 days ahead — flagged for immediate action`);
      return l;
    }
    const l = [`Reading local knowledge sources for ${dest}...`];
    if (hasKids)       l.push(`Filtering for family-friendly stays and child-safe activities`);
    else if (elderly)  l.push(`Checking accessibility, comfort levels, and pacing requirements`);
    else               l.push(`Cross-referencing seasonal conditions and off-the-beaten-path options`);
    l.push(`Local risk signals and hidden tips being surfaced`);
    return l;
  }

  if (sl.includes("generat")||sl.includes("itinerary")||sl.includes("building")||sl.includes("checking")) {
    if (dk.includes("kerala")||dk.includes("munnar")||dk.includes("alleppey")||dk.includes("kochi")) {
      const l = [`Routing ${nights} days: Munnar (hills) → Alleppey (backwaters) arc`];
      if (toddler) l.push(`Houseboat swapped: land hotel near jetty + 4-hr day cruise — safe for your toddler`);
      else l.push(`Houseboat booking: hotel-operator route flagged — avoids 30–50% jetty markup`);
      l.push(`Midday drive timing adjusted — skirts afternoon monsoon rains in June`);
      return l;
    }
    if (dk.includes("goa")) {
      const l = [`Sequencing ${nights} nights: heritage quarter → beach belt → quiet south`];
      if (hasKids) l.push(`Nightlife zones avoided — routing through family-safe Candolim and Benaulim`);
      l.push(`Seafood trail woven in: Ritz Classic, Florentine, Thalassa shortlisted`);
      return l;
    }
    if (dk.includes("rajasthan")||dk.includes("jaipur")||dk.includes("jodhpur")||dk.includes("jaisalmer")||dk.includes("udaipur")) {
      const l = [`Routing ${nights} days across the Golden Triangle–Thar circuit`];
      if (hasKids) l.push(`Jaisalmer desert camp: sunset camel ride + starfield dinner — standout moment`);
      else if (elderly) l.push(`Overnight train between cities flagged — saves a hotel night, smoother than long drives`);
      l.push(`Heritage hotels positioned within fort walls where possible`);
      return l;
    }
    if (dk.includes("ladakh")||dk.includes("leh")) {
      const l = [`Day 1–2: acclimatisation at Leh — monasteries only, no altitude gain`];
      l.push(`Nubra dunes + Pangong blue: routed as 2-night extension via Khardung La`);
      l.push(`Shared SUV arranged — Ladakh roads require 4WD, not hatchbacks`);
      return l;
    }
    const l = [`Sequencing ${nights} days for your ${dest} arc...`];
    if (toddler)      l.push(`Midday rest blocks inserted — 1:00–2:30 PM protected, no activities`);
    else if (hasKids) l.push(`Activity pacing: max 2–3 stops per day with meal gaps respected`);
    else if (elderly) l.push(`Afternoon rest time preserved — comfort over coverage`);
    l.push(`Hotels positioned by itinerary logic, not star rating`);
    return l;
  }

  if (sl.includes("finalising")||sl.includes("budget")||sl.includes("review")||sl.includes("ready")) {
    const l: string[] = [];
    if (budget === "budget")  l.push(`Budget-optimised pricing locked — no unnecessary upgrades slipped in`);
    else if (budget === "premium") l.push(`Premium rates cross-checked against current ${dest} market`);
    else l.push(`Budget breakdown calibrated to ${dest} market rates`);
    l.push(`Local risk warnings surfaced and woven into plan notes`);
    l.push(`Your personalised ${dest} plan is ready ✦`);
    return l;
  }

  if (sl.includes("refin")) {
    const l: string[] = [`Running quality checks on your ${dest} plan...`];
    if (toddler)      l.push(`Toddler rules re-verified — houseboat swap and midday rest confirmed`);
    else if (elderly) l.push(`Accessibility constraints re-checked — no steep terrain or long walks`);
    else if (hasKids) l.push(`Child-safe pacing confirmed — activity count and meal gaps verified`);
    else              l.push(`Taste alignment checked — crowd, pace, and accommodation preferences honoured`);
    l.push(`Applying fixes before sending to you...`);
    return l;
  }

  return [`Crafting your ${dest} plan...`];
}

// ── Route Map ─────────────────────────────────────────────────────────────────

function RouteMap({ destination, waypoints }: { destination: string; waypoints: [number, number][] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polyRef = useRef<L.Polyline | null>(null);
  const headRef = useRef<L.CircleMarker | null>(null);
  const dotsRef = useRef<L.CircleMarker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = getCoordinates(destination) ?? [20.5937, 78.9629];
    const map = L.map(containerRef.current, {
      center, zoom: 8, zoomControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, attributionControl: false,
    });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || waypoints.length === 0) return;

    polyRef.current?.remove(); polyRef.current = null;
    headRef.current?.remove(); headRef.current = null;
    dotsRef.current.forEach(d => d.remove()); dotsRef.current = [];

    if (waypoints.length >= 2) {
      polyRef.current = L.polyline(waypoints, {
        color: "#B0492F", weight: 2.5, opacity: 0.9, dashArray: "8 5",
      }).addTo(map);
      map.fitBounds(L.latLngBounds(waypoints), { padding: [28, 28], animate: true, duration: 0.8 });
    } else {
      map.setView(waypoints[0], 8, { animate: true, duration: 0.8 });
    }

    for (let i = 0; i < waypoints.length - 1; i++) {
      const d = L.circleMarker(waypoints[i], {
        radius: 4, fillColor: "#B0492F", color: "#F4ECDB", weight: 2, fillOpacity: 0.75,
      }).addTo(map);
      dotsRef.current.push(d);
    }

    headRef.current = L.circleMarker(waypoints[waypoints.length - 1], {
      radius: 8, fillColor: "#B0492F", color: "#F4ECDB", weight: 3, fillOpacity: 1,
    }).addTo(map);
  }, [waypoints]);

  return (
    <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const STYLE = `
  @keyframes slideUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  .gp-journal::-webkit-scrollbar { display: none; }
  .gp-journal { scrollbar-width: none; }
`;

export default function GenerationProgress({ stageIndex, stageLabel, destination = "", tripParams }: Props) {
  const [journal, setJournal] = useState<JournalLine[]>([]);
  const [cursor, setCursor] = useState(true);
  const [wide, setWide] = useState(() => window.innerWidth >= 960);

  const queue = useRef<string[]>([]);
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nid = useRef(0);
  const journalEl = useRef<HTMLDivElement>(null);
  const prevStage = useRef("");

  useEffect(() => {
    const h = () => setWide(window.innerWidth >= 960);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setCursor(c => !c), 530);
    return () => clearInterval(t);
  }, []);

  // Typewriter engine — defined once via useEffect so refs are always current
  useEffect(() => {
    let dead = false;

    function typeNext() {
      if (dead || queue.current.length === 0) { typing.current = false; return; }
      typing.current = true;
      const text = queue.current.shift()!;
      const id = ++nid.current;
      setJournal(p => [...p, { id, full: text, shown: "", complete: false }]);
      let pos = 0;
      function tick() {
        if (dead) return;
        pos++;
        setJournal(p => p.map(l => l.id === id ? { ...l, shown: text.slice(0, pos) } : l));
        if (pos < text.length) {
          timer.current = setTimeout(tick, 17);
        } else {
          setJournal(p => p.map(l => l.id === id ? { ...l, complete: true } : l));
          timer.current = setTimeout(typeNext, 360);
        }
      }
      timer.current = setTimeout(tick, 17);
    }

    function enqueue(lines: string[]) {
      queue.current.push(...lines);
      if (!typing.current) typeNext();
    }

    // Opening lines
    const dest = destination.split(",")[0].trim();
    const nights = tripParams?.duration_days ?? 5;
    enqueue([`Planning your ${nights}-night ${dest} adventure ✦`, `For ${personaLabel(tripParams)}`]);

    // Expose enqueue for stage updates
    (window as unknown as Record<string, unknown>).__gpEnqueue = enqueue;

    return () => {
      dead = true;
      if (timer.current) clearTimeout(timer.current);
      delete (window as unknown as Record<string, unknown>).__gpEnqueue;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!stageLabel || stageLabel === prevStage.current) return;
    prevStage.current = stageLabel;
    const enqueue = (window as unknown as Record<string, unknown>).__gpEnqueue as ((l: string[]) => void) | undefined;
    enqueue?.(journalLines(stageLabel, tripParams, destination));
  }, [stageLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll journal
  useEffect(() => {
    if (journalEl.current) journalEl.current.scrollTop = journalEl.current.scrollHeight;
  }, [journal]);

  const imgUrl = getDestinationImageUrl(destination);
  const allWpts = getRouteWaypoints(destination);
  const visWpts = allWpts.slice(0, Math.max(1, stageIndex + 1));
  const dest = destination.split(",")[0].trim();
  const nights = tripParams?.duration_days ?? 5;
  const budget = tripParams?.budget_bracket ?? "mid";
  const budgetChip = budget === "budget" ? "Budget" : budget === "premium" ? "Premium" : "Mid-range";
  const styles = (tripParams?.trip_style ?? []).slice(0, 2);

  // ── Shared right panel ────────────────────────────────────────────────────
  function RightPanel({ fill }: { fill?: boolean }) {
    return (
      <div style={{
        background: "#1a1108",
        display: "flex", flexDirection: "column",
        padding: wide ? "32px 28px" : "20px 18px",
        gap: 20, overflow: "hidden",
        ...(fill ? { flex: 1, minHeight: 0 } : { width: 400, flexShrink: 0 }),
      }}>
        {/* Persona badge */}
        <div>
          <div style={{ fontSize: 22, fontFamily: "var(--font-display)", color: "rgba(244,236,219,0.95)", letterSpacing: "0.01em", marginBottom: 4 }}>
            {dest} <span style={{ color: "rgba(255,195,100,0.85)" }}>✦</span>
          </div>
          <div style={{ fontSize: 13, color: "rgba(244,236,219,0.55)", fontFamily: "var(--font-body)", marginBottom: 10 }}>
            {personaLabel(tripParams)}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[`${nights} nights`, budgetChip, ...styles].map(c => (
              <span key={c} style={{
                fontSize: 9, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
                padding: "3px 8px", border: "1px solid rgba(244,236,219,0.18)",
                borderRadius: 20, color: "rgba(244,236,219,0.5)",
              }}>{c}</span>
            ))}
          </div>
        </div>

        {/* Live journal */}
        <div ref={journalEl} className="gp-journal" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 11, minHeight: 0 }}>
          {journal.map(line => (
            <div key={line.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", animation: "slideUp 0.35s ease" }}>
              <span style={{ color: "rgba(255,195,100,0.6)", fontSize: 9, marginTop: 4, flexShrink: 0 }}>✦</span>
              <span style={{ fontSize: 13, lineHeight: 1.65, fontFamily: "var(--font-body)", color: line.complete ? "rgba(244,236,219,0.8)" : "rgba(244,236,219,0.95)" }}>
                {line.shown}
                {!line.complete && <span style={{ opacity: cursor ? 1 : 0, color: "rgba(255,195,100,0.8)", transition: "opacity 0.1s" }}>|</span>}
              </span>
            </div>
          ))}
        </div>

        {/* Stage checklist */}
        <div style={{ borderTop: "1px solid rgba(244,236,219,0.08)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {PROGRESS_STAGES.map((s, i) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, opacity: i > stageIndex ? 0.25 : 1, transition: "opacity 0.5s" }}>
              <span style={{
                width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                background: i < stageIndex ? "#B0492F" : "transparent",
                border: `2px solid ${i <= stageIndex ? "#B0492F" : "rgba(244,236,219,0.25)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.4s",
              }}>
                {i < stageIndex && <Check size={9} strokeWidth={3} color="#F4ECDB" />}
              </span>
              <span style={{ fontSize: 11, fontFamily: "var(--font-body)", color: i === stageIndex ? "rgba(244,236,219,0.9)" : "rgba(244,236,219,0.4)", fontWeight: i === stageIndex ? 600 : 400, transition: "all 0.4s" }}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (wide) {
    return (
      <>
        <style>{STYLE}</style>
        <div style={{ display: "flex", height: "100svh", background: "#1a1108" }}>
          {/* Left: photo + map */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {imgUrl ? (
              <div style={{ height: "42%", position: "relative", flexShrink: 0, overflow: "hidden" }}>
                <img src={imgUrl} alt={dest} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(26,17,8,0.25) 0%,rgba(26,17,8,0.05) 40%,rgba(26,17,8,0.7) 100%)" }} />
                <div style={{ position: "absolute", bottom: 14, left: 20, fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(244,236,219,0.6)", fontFamily: "var(--font-body)" }}>
                  tripsathi
                </div>
              </div>
            ) : (
              <div style={{ height: "10%", flexShrink: 0, display: "flex", alignItems: "center", padding: "0 20px" }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(244,236,219,0.4)" }}>tripsathi</span>
              </div>
            )}
            <RouteMap destination={destination} waypoints={visWpts} />
          </div>
          <RightPanel />
        </div>
      </>
    );
  }

  // Mobile
  return (
    <>
      <style>{STYLE}</style>
      <div style={{ height: "100svh", display: "flex", flexDirection: "column", background: "#1a1108", overflow: "hidden" }}>
        {imgUrl && (
          <div style={{ height: "32%", flexShrink: 0, position: "relative", overflow: "hidden" }}>
            <img src={imgUrl} alt={dest} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom,rgba(26,17,8,0.2) 0%,rgba(26,17,8,0.85) 100%)" }} />
            <div style={{ position: "absolute", bottom: 12, left: 16, fontSize: 18, fontFamily: "var(--font-display)", color: "rgba(244,236,219,0.95)" }}>
              {dest} <span style={{ color: "rgba(255,195,100,0.9)" }}>✦</span>
            </div>
          </div>
        )}
        <RightPanel fill />
      </div>
    </>
  );
}
