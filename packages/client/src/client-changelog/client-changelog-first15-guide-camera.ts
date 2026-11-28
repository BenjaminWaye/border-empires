import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const FIRST15_GUIDE_CAMERA_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "Guide progress, Show buttons and the landing card fixed",
  why: "New players saw the guide start at 5/18, Show buttons move the map out of sight, and a landing card that disagreed with Diplomacy.",
  changes: [
    "Opening Manifests early no longer ticks the guide's earlier steps",
    "After Finish the guide's button shows no step count while the steps left wait",
    "Show me closes Manifests and other screens over the map",
    "The guide says when a queued Expand To is taking its town, and names Go as the button that launches the drone",
    "Next › and tracker rows open the tile's menu",
    "Empire Integrity's Show buttons close the panel on a phone",
    "Tapping a grain plot by your town no longer jumps the camera to the town and back",
    "Show on map for a charge in unexplored ground stays zoomed in enough to tap a tile",
    "Hills tiles are named Hills, matching their Hills bonuses",
    "The landing card counts player Houses and AI Houses, and fits a 375px screen"
  ]
};
