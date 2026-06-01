import { useEffect, useRef, useState } from "react";
import { Check, Clock } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { PROGRESS_STAGES } from "../../lib/fakeProgress";
import { getDestinationImageUrl } from "../../lib/destinationImage";
import { getCoordinates } from "../../lib/destinationCoordinates";

interface Props {
  stageIndex: number;
  stageLabel: string;
  destination?: string;
}

// ── Tidbits ───────────────────────────────────────────────────────────────────

const TIDBITS: Record<string, string[]> = {
  kerala: [
    "Kerala has the highest literacy rate in India — over 96%.",
    "The backwaters stretch over 900 km of lakes, canals and rivers.",
    "Kathakali, the classical dance-drama, originated here in the 17th century.",
    "Kerala is called 'God's Own Country' — home to 44 rivers and lush hills.",
    "Ayurveda has been practiced in Kerala for over 5,000 years.",
  ],
  goa: [
    "Goa was a Portuguese colony for 451 years, till 1961.",
    "The Basilica of Bom Jesus holds the remains of St. Francis Xavier.",
    "Goa has the highest per capita income of any Indian state.",
    "Feni, made from cashew apples, is Goa's iconic local spirit.",
    "Old Goa's churches are a UNESCO World Heritage Site.",
  ],
  rajasthan: [
    "Rajasthan means 'Land of Kings' — home to over 400 forts and palaces.",
    "The Thar Desert covers about 60% of Rajasthan's total area.",
    "Jaisalmer Fort is one of the world's largest fully preserved medieval cities.",
    "Pushkar Camel Fair is the world's largest camel trading fair.",
    "Rajasthan borders Pakistan — the Tanot border is open to tourists.",
  ],
  ladakh: [
    "Ladakh sits at an average altitude of 3,500 metres above sea level.",
    "Khardung La (5,359m) is one of the world's highest motorable roads.",
    "Pangong Lake stretches from India into Tibet — 60% is in China.",
    "Ladakh receives less than 10 cm of rainfall a year — a cold desert.",
    "The ancient Hemis Monastery dates to the early 17th century.",
  ],
  munnar: [
    "Munnar has over 30,000 acres of tea plantations — among the world's highest.",
    "The Neelakurinji flower blooms in Munnar only once every 12 years.",
    "At ~1,600m, Munnar stays cool all year — a British-era summer retreat.",
    "Eravikulam National Park protects the endangered Nilgiri Tahr.",
    "Tea was first commercially grown in Munnar in 1877.",
  ],
  coorg: [
    "Coorg produces 30% of India's total coffee output.",
    "The Kodava people of Coorg have unique martial traditions.",
    "Abbey Falls drops 70 feet through spice and coffee plantations.",
    "Coorg is called the 'Scotland of India' for its rolling misty hills.",
    "Raja's Seat in Madikeri is where Coorg's kings once watched the sunset.",
  ],
  guwahati: [
    "Guwahati is the gateway to Northeast India's seven sister states.",
    "The Kamakhya Temple here is one of India's most revered Shakti Peethas.",
    "The Brahmaputra river at Guwahati is over 16 km wide in places.",
    "Assam produces over 50% of India's total tea output.",
    "Kaziranga National Park near Guwahati shelters 70% of world's one-horned rhinos.",
  ],
  puri: [
    "Puri's Jagannath Temple is one of Char Dham — the four sacred Hindu sites.",
    "The Rath Yatra chariot festival in Puri draws over a million pilgrims.",
    "Puri beach is one of India's few beaches where you can see both sunrise and sunset.",
    "The Jagannath temple has been feeding thousands daily for over 800 years.",
    "Puri's Chilika Lake is Asia's largest coastal lagoon.",
  ],
};

const GENERIC_TIDBITS = [
  "India has 42 UNESCO World Heritage Sites — 8th highest in the world.",
  "The Indian Railways runs over 13,000 passenger trains daily.",
  "India is home to the world's largest diaspora — 32 million people abroad.",
  "Over 19,500 languages or dialects are spoken as mother tongues in India.",
  "Chess was invented in India around the 6th century AD.",
  "India has the world's largest vegetarian population — about 400 million.",
  "The Sundarbans is the world's largest mangrove forest.",
];

function getTidbits(destination: string): string[] {
  const key = destination.toLowerCase().split(",")[0].trim();
  for (const [k, v] of Object.entries(TIDBITS)) {
    if (key.includes(k)) return v;
  }
  return GENERIC_TIDBITS;
}

function RotatingTidbit({ destination, glass = false }: { destination: string; glass?: boolean }) {
  const tidbits = getTidbits(destination);
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % tidbits.length);
        setFade(true);
      }, 350);
    }, 5000);
    return () => clearInterval(interval);
  }, [tidbits.length]);

  return (
    <div style={{
      padding: "12px 16px",
      background: glass ? "rgba(244,236,219,0.18)" : "rgba(244,236,219,0.85)",
      backdropFilter: glass ? "blur(8px)" : undefined,
      border: glass ? "1.5px solid rgba(244,236,219,0.35)" : "1.5px solid var(--border)",
      borderLeft: "4px solid var(--ochre-deep)",
      borderRadius: 14,
      transition: "opacity 350ms ease",
      opacity: fade ? 1 : 0,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
        textTransform: "uppercase", marginBottom: 5,
        color: glass ? "rgba(255,195,100,0.9)" : "var(--ochre-deep)",
      }}>
        did you know?
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600, lineHeight: 1.6,
        fontFamily: "var(--font-body)",
        color: glass ? "rgba(244,236,219,0.95)" : "var(--bark)",
      }}>
        {tidbits[idx]}
      </div>
    </div>
  );
}

// ── Destination mini-map ──────────────────────────────────────────────────────

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

function DestinationMap({ destination, height = 190 }: { destination: string; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "your_mapbox_token_here") return;

    const coords = getCoordinates(destination);
    const center: [number, number] = coords ? [coords[1], coords[0]] : [78.9629, 20.5937]; // fallback: India centre
    const zoom = coords ? 7 : 4;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center,
      zoom,
      interactive: false,
      attributionControl: false,
    });

    map.on("load", () => {
      if (coords) {
        const el = document.createElement("div");
        el.style.cssText = `
          width:32px;height:32px;border-radius:50%;
          background:#B45309;color:#F4ECDB;
          display:flex;align-items:center;justify-content:center;
          font-size:15px;border:3px solid #F4ECDB;
          box-shadow:0 3px 12px rgba(62,47,35,0.45);
        `;
        el.textContent = "✦";
        new mapboxgl.Marker({ element: el }).setLngLat(center).addTo(map);
      }
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [destination]);

  if (!MAPBOX_TOKEN || MAPBOX_TOKEN === "your_mapbox_token_here") return null;

  return (
    <div style={{ height, borderRadius: 16, overflow: "hidden", flexShrink: 0 }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GenerationProgress({ stageIndex, stageLabel: _stageLabel, destination = "" }: Props) {
  const [showLongWait, setShowLongWait] = useState(false);
  const imgUrl = getDestinationImageUrl(destination);

  useEffect(() => {
    const t = setTimeout(() => setShowLongWait(true), 60000);
    return () => clearTimeout(t);
  }, []);

  const stageList = (
    <>
      <div className="stage-head">
        <h1>sketching your<br /><span className="sw">plan</span></h1>
        <div className="now">
          <span className="spinner" />
          {PROGRESS_STAGES[stageIndex]?.label ?? "finalising..."}
        </div>
      </div>
      <div className="stages">
        {PROGRESS_STAGES.map((stage, i) => (
          <div key={stage.label} className={`stage-row ${i < stageIndex ? "done" : i === stageIndex ? "current" : "todo"}`}>
            <span className="dot">{i < stageIndex && <Check size={11} strokeWidth={3} />}</span>
            <span className="name">{stage.label}</span>
          </div>
        ))}
      </div>
      <div className="eta">
        <Clock size={14} strokeWidth={2} />
        <span>typical plans take <b>about a minute</b> — yours is going well.</span>
      </div>
      {showLongWait && <div className="scribble-note">↑ {destination || "this one"} is a long one, hold tight ✦</div>}
    </>
  );

  // ── Full-bleed layout (destination image available) ───────────────────────
  if (imgUrl) {
    return (
      <div style={{ width: "100%", height: "100svh", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Background image */}
        <img src={imgUrl} alt={destination} style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center",
          animation: "fadeIn 0.8s ease",
        }} />
        {/* Gradient: dark top → semi-transparent middle → paper bottom */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom, rgba(62,47,35,0.65) 0%, rgba(62,47,35,0.35) 30%, rgba(62,47,35,0.25) 55%, rgba(244,236,219,0.9) 72%, var(--paper) 86%)",
        }} />

        {/* Topbar */}
        <div className="topbar centered" style={{ position: "relative", zIndex: 1 }}>
          <div className="brand-mini">
            <span className="word" style={{ color: "var(--paper)" }}>trip<i style={{ color: "rgba(255,195,100,0.95)" }}>sathi</i></span>
          </div>
        </div>

        {/* Middle section — map + tidbit */}
        <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", gap: 12 }}>
          {destination && (
            <div style={{
              fontFamily: "var(--font-display)", fontSize: 20,
              color: "var(--paper)", letterSpacing: "0.01em",
              textShadow: "0 2px 10px rgba(62,47,35,0.6)",
              marginBottom: 2,
            }}>
              {destination} ✦
            </div>
          )}
          <DestinationMap destination={destination} height={190} />
          <RotatingTidbit destination={destination} glass />
        </div>

        {/* Bottom sheet */}
        <div className="progress-sheet">
          <div className="cx" style={{ padding: 0 }}>
            {stageList}
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback card layout (no image) ──────────────────────────────────────
  return (
    <div className="screen" style={{ minHeight: "unset" }}>
      <div className="topbar centered">
        <div className="brand-mini">
          <span className="word">trip<i>sathi</i></span>
        </div>
      </div>
      <div className="stage" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "30px 0" }}>
        <div className="cx" style={{ width: "100%" }}>
          <div className="progress-card" style={{ width: "100%" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <DestinationMap destination={destination} height={180} />
              <RotatingTidbit destination={destination} />
            </div>
            {stageList}
          </div>
        </div>
      </div>
    </div>
  );
}
