import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAYSTATION_VISION_LOOK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Waystation scouting reward is now a five-minute look",
  why: "The waystation reward that reveals a nearby town gave live sight of it for the rest of the season, so you could watch a rival town you had no land near.",
  changes: [
    "The reward now shows the nearby town live for 5 minutes, then the area stays on your map as remembered land under fog.",
    "Sight already granted by this reward ends with this update."
  ]
};
