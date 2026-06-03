import placesMap from "./placesMap.generated.json";

const map = placesMap as Record<string, string>;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function getPlaceImageUrl(activityName: string, destinationCity: string): string | null {
  const key = slugify(`${activityName}_${destinationCity}`);
  const filename = map[key];
  if (!filename) return null;
  return `/images/places/${filename}`;
}
