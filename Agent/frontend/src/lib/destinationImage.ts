import destinationMap from "./destinationMap.generated.json";

const map = destinationMap as Record<string, string>;

function normalize(location: string): string {
  return location
    .split(",")[0]          // "Munnar, Kerala" → "Munnar"
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[()/']/g, "");
}

// Returns the /static image URL if we have a photo, null otherwise (use CSS gradient fallback).
export function getDestinationImageUrl(location: string): string | null {
  const key = normalize(location);
  const filename = map[key];
  if (!filename) return null;
  return `/images/destinations/${filename}`;
}
