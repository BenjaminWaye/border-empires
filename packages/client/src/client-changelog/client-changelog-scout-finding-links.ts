import type { ClientChangelogEntry } from "./client-changelog-data.js";

// A scout report's Show only went to where the drone was sent, not to the
// town, waystation or resources it found on the way.
export const SCOUT_FINDING_LINKS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Jump to each scout drone find",
  why: "A scout report listed what the drone found, but Show only went to where you sent it, so the town or grain it saw on the way was hard to find.",
  changes: [
    "In the Chronicle, each find in a scout report is a link: tap 1 town, 1 waystation or Grain (10 tiles) to go there",
    "The map rings up to 24 tiles of that find for a few seconds, on the 3D and 2D maps",
    "Reports from before this update keep their plain text and Show"
  ]
};
