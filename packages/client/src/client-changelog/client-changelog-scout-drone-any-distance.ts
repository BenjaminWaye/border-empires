import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Playtest 2026-11-20: a drone that turned back 15 tiles past your land never
// reached a rival ~70 tiles away, so an island start could not find anyone.
export const SCOUT_DRONE_ANY_DISTANCE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Scout drones fly as far as you send them",
  why: "Your drone turned back 15 tiles past your land, so on an island or a quiet corner of the map it never found another empire.",
  changes: [
    "Explore has no range limit: tap any unexplored tile and the drone flies all the way there and back",
    "A farther target only takes longer, at the same pace as before over open land and sea",
    "A rival's border still turns it back, so a long flight towards someone tells you where their land starts"
  ]
};
