export interface ProgressStage {
  label: string;
}

export const PROGRESS_STAGES: ProgressStage[] = [
  { label: "Understanding your profile..." },
  { label: "Researching destinations & logistics..." },
  { label: "Checking local conditions & accessibility..." },
  { label: "Building your itinerary..." },
  { label: "Finalising budget & recommendations..." },
];
