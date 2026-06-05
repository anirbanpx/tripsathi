// Themed SVG illustrations for journal day cards.
// All use stroke-based line art in the app palette.

const OCHRE = "#A6701D";
const BARK  = "#3E2F23";
const PAPER = "#F4ECDB";

export function PalmTree({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Trunk */}
      <path d="M42 72 Q38 52 40 36 Q41 26 44 18" stroke={OCHRE} strokeWidth="2.8" strokeLinecap="round"/>
      {/* Fronds */}
      <path d="M44 18 Q28 12 18 20" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      <path d="M44 18 Q32 8 36 0" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      <path d="M44 18 Q58 10 64 18" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      <path d="M44 18 Q56 20 60 30" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      <path d="M44 18 Q36 22 28 28" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      {/* Coconuts */}
      <circle cx="40" cy="22" r="3" fill={OCHRE} opacity="0.6"/>
      <circle cx="46" cy="24" r="2.5" fill={OCHRE} opacity="0.5"/>
      {/* Ground line */}
      <path d="M28 72 Q42 70 56 72" stroke={BARK} strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

export function Mountains({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Back peak */}
      <path d="M14 62 L36 18 L58 62" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      {/* Snow cap back */}
      <path d="M36 18 L30 34 L42 34 Z" fill={PAPER} stroke={OCHRE} strokeWidth="1.2" opacity="0.7"/>
      {/* Front-left hill */}
      <path d="M4 66 L26 36 L46 66" stroke={BARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.45"/>
      {/* Front-right hill */}
      <path d="M36 66 L56 28 L76 66" stroke={BARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Snow cap front */}
      <path d="M56 28 L51 41 L61 41 Z" fill={PAPER} stroke={BARK} strokeWidth="1.3" opacity="0.8"/>
      {/* Ground */}
      <path d="M4 66 Q40 70 76 66" stroke={BARK} strokeWidth="1.5" strokeLinecap="round" opacity="0.25"/>
    </svg>
  );
}

export function Boat({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Water ripples */}
      <path d="M8 62 Q20 58 32 62 Q44 66 56 62 Q68 58 76 62" stroke={OCHRE} strokeWidth="1.5" strokeLinecap="round" opacity="0.4"/>
      <path d="M12 68 Q26 64 40 68 Q54 72 68 68" stroke={OCHRE} strokeWidth="1.2" strokeLinecap="round" opacity="0.25"/>
      {/* Hull */}
      <path d="M16 56 Q40 62 64 56 L60 48 Q40 52 20 48 Z" fill={PAPER} stroke={BARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Canopy */}
      <path d="M22 48 L22 36 Q40 30 58 36 L58 48" stroke={BARK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 36 Q40 28 58 36" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      {/* Pole */}
      <line x1="40" y1="30" x2="40" y2="16" stroke={BARK} strokeWidth="1.8" strokeLinecap="round"/>
      {/* Flag */}
      <path d="M40 16 L52 20 L40 24" fill={OCHRE} opacity="0.7"/>
    </svg>
  );
}

export function TeaCup({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Steam */}
      <path d="M28 22 Q24 16 28 10 Q32 4 28 0" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      <path d="M40 20 Q36 13 40 7 Q44 1 40 -4" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" opacity="0.5"/>
      <path d="M52 22 Q48 16 52 10 Q56 4 52 0" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      {/* Saucer */}
      <ellipse cx="40" cy="68" rx="24" ry="5" stroke={BARK} strokeWidth="1.8" fill={PAPER} opacity="0.9"/>
      {/* Cup body */}
      <path d="M20 38 Q22 60 40 62 Q58 60 60 38 Z" fill={PAPER} stroke={BARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Cup rim */}
      <ellipse cx="40" cy="38" rx="20" ry="4" stroke={BARK} strokeWidth="1.8" fill={PAPER}/>
      {/* Tea surface */}
      <ellipse cx="40" cy="38" rx="17" ry="3" fill={OCHRE} opacity="0.35"/>
      {/* Handle */}
      <path d="M60 44 Q72 44 72 52 Q72 60 60 58" stroke={BARK} strokeWidth="2" strokeLinecap="round" fill="none"/>
    </svg>
  );
}

export function Temple({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Spire */}
      <line x1="40" y1="4" x2="40" y2="16" stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      <ellipse cx="40" cy="5" rx="3" ry="3" fill={OCHRE}/>
      {/* Tiers */}
      <rect x="32" y="16" width="16" height="6" rx="1" fill={PAPER} stroke={BARK} strokeWidth="1.8"/>
      <rect x="28" y="22" width="24" height="6" rx="1" fill={PAPER} stroke={BARK} strokeWidth="1.8"/>
      <rect x="24" y="28" width="32" height="6" rx="1" fill={PAPER} stroke={BARK} strokeWidth="1.8"/>
      {/* Main body */}
      <rect x="20" y="34" width="40" height="24" rx="2" fill={PAPER} stroke={BARK} strokeWidth="2"/>
      {/* Entrance arch */}
      <path d="M32 58 L32 46 Q40 40 48 46 L48 58" fill={OCHRE} stroke={BARK} strokeWidth="1.5" opacity="0.6"/>
      {/* Columns */}
      <line x1="24" y1="34" x2="24" y2="58" stroke={BARK} strokeWidth="1.5"/>
      <line x1="56" y1="34" x2="56" y2="58" stroke={BARK} strokeWidth="1.5"/>
      {/* Base */}
      <rect x="16" y="58" width="48" height="5" rx="1" fill={PAPER} stroke={BARK} strokeWidth="1.8"/>
      {/* Steps */}
      <rect x="12" y="63" width="56" height="4" rx="1" stroke={BARK} strokeWidth="1.5" opacity="0.5"/>
    </svg>
  );
}

export function Camel({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <ellipse cx="40" cy="50" rx="22" ry="14" fill={PAPER} stroke={OCHRE} strokeWidth="2"/>
      {/* Hump */}
      <path d="M30 38 Q38 24 46 38" fill={PAPER} stroke={OCHRE} strokeWidth="2" strokeLinecap="round"/>
      {/* Neck */}
      <path d="M26 42 Q20 34 22 24" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"/>
      {/* Head */}
      <ellipse cx="22" cy="22" rx="7" ry="5" fill={PAPER} stroke={OCHRE} strokeWidth="2"/>
      {/* Ear */}
      <path d="M18 18 L16 14 L20 16" stroke={OCHRE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Eye */}
      <circle cx="20" cy="21" r="1.2" fill={OCHRE}/>
      {/* Legs */}
      <line x1="28" y1="62" x2="26" y2="76" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="34" y1="63" x2="33" y2="76" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="46" y1="63" x2="47" y2="76" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="52" y1="62" x2="54" y2="76" stroke={OCHRE} strokeWidth="2.5" strokeLinecap="round"/>
      {/* Tail */}
      <path d="M62 50 Q70 46 68 54" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round"/>
      {/* Sand ground */}
      <path d="M10 76 Q40 74 70 76" stroke={BARK} strokeWidth="1.5" strokeLinecap="round" opacity="0.3"/>
    </svg>
  );
}

// ── Archetype illustrations for onboarding ──────────────────────────

export function ArchSlowExplorer({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Arched window frame */}
      <path d="M10 54 L10 26 Q10 8 28 8 Q46 8 46 26 L46 54" stroke={BARK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sill */}
      <line x1="6" y1="54" x2="50" y2="54" stroke={BARK} strokeWidth="2" strokeLinecap="round"/>
      {/* Crossbar */}
      <line x1="10" y1="34" x2="46" y2="34" stroke={BARK} strokeWidth="1.6" strokeLinecap="round"/>
      {/* Vertical bar */}
      <line x1="28" y1="8" x2="28" y2="54" stroke={BARK} strokeWidth="1.6" strokeLinecap="round"/>
      {/* Morning glow inside arch */}
      <path d="M12 33 L12 26 Q12 11 28 11 Q44 11 44 26 L44 33 Z" fill={OCHRE} opacity="0.12"/>
      {/* Rising sun arc */}
      <path d="M18 34 Q28 20 38 34" stroke={OCHRE} strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
      {/* Sun dot */}
      <circle cx="28" cy="22" r="4" fill={OCHRE} opacity="0.55"/>
      {/* Rays */}
      <line x1="28" y1="15" x2="28" y2="12" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="34" y1="17" x2="36" y2="14" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="22" y1="17" x2="20" y2="14" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
    </svg>
  );
}

export function ArchBalancedTraveler({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Backpack main body */}
      <rect x="12" y="20" width="32" height="30" rx="6" fill={PAPER} stroke={BARK} strokeWidth="2"/>
      {/* Top lid */}
      <rect x="14" y="13" width="28" height="10" rx="4" fill={PAPER} stroke={BARK} strokeWidth="1.8"/>
      {/* Straps */}
      <path d="M17 20 Q13 28 15 44" stroke={BARK} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <path d="M39 20 Q43 28 41 44" stroke={BARK} strokeWidth="2" strokeLinecap="round" fill="none"/>
      {/* Front pocket */}
      <rect x="18" y="33" width="20" height="12" rx="4" stroke={OCHRE} strokeWidth="1.6" fill="none"/>
      {/* Pocket zip */}
      <line x1="18" y1="38" x2="38" y2="38" stroke={OCHRE} strokeWidth="1.2" strokeLinecap="round" opacity="0.6"/>
      {/* Map sticking out of top */}
      <path d="M30 13 L30 6 L42 4 L42 11" stroke={OCHRE} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Map fold lines */}
      <line x1="34" y1="5" x2="34" y2="12" stroke={OCHRE} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <line x1="38" y1="4" x2="38" y2="11" stroke={OCHRE} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

export function ArchPackedAdventurer({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Background mountain */}
      <path d="M6 50 L26 16 L46 50" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.45"/>
      {/* Snow cap back */}
      <path d="M26 16 L21 28 L31 28 Z" fill={PAPER} stroke={OCHRE} strokeWidth="1.2" opacity="0.6"/>
      {/* Right mountain */}
      <path d="M30 50 L48 22 L66 50" stroke={BARK} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
      {/* Tent in foreground */}
      <path d="M14 50 L28 30 L42 50 Z" fill={PAPER} stroke={BARK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Tent door */}
      <path d="M24 50 Q28 40 32 50" stroke={BARK} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      {/* Tent pole hint */}
      <line x1="28" y1="30" x2="28" y2="50" stroke={OCHRE} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
      {/* Sunrise arc */}
      <path d="M8 20 Q18 6 28 4 Q38 6 48 20" stroke={OCHRE} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity="0.7"/>
      {/* Sun rays */}
      <line x1="28" y1="4" x2="28" y2="0" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="38" y1="7" x2="41" y2="3" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="18" y1="7" x2="15" y2="3" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.6"/>
      <line x1="46" y1="16" x2="50" y2="13" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
      <line x1="10" y1="16" x2="6" y2="13" stroke={OCHRE} strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
      {/* Ground line */}
      <line x1="6" y1="50" x2="50" y2="50" stroke={BARK} strokeWidth="1.4" strokeLinecap="round" opacity="0.2"/>
    </svg>
  );
}

// Pick illustration based on location string
export function getIllustration(location: string): React.ReactElement {
  const l = location.toLowerCase();
  if (/munnar|coorg|ooty|kodaikanal|darjeeling|manali|shimla|ladakh|hill/.test(l))
    return <Mountains />;
  if (/alleppey|alappuzha|backwater|kumarakom|lake|houseboat|boat/.test(l))
    return <Boat />;
  if (/kovalam|varkala|goa|puri|beach|coastal|coast|sea/.test(l))
    return <PalmTree />;
  if (/rajasthan|jaisalmer|jodhpur|bikaner|thar|pushkar|camel/.test(l))
    return <Camel />;
  if (/trivandrum|thiruvananthapuram|varanasi|madurai|temple|mysore|hampi/.test(l))
    return <Temple />;
  return <TeaCup />; // default — chai = India
}
