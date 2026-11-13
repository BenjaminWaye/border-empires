import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COMBAT_LEGIBILITY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Clearer marches and attack odds",
  why: "A march over empty land read \"Fighting\", its manpower cost went unexplained, region attacks hid their odds, and a short flag was blamed on the wrong tile.",
  changes: [
    "A march stepping onto unclaimed land reads \"Claiming (x, y)\" instead of \"Fighting at (x, y)\"",
    "The March To sheet says how much manpower each tile claimed on the way costs",
    "Attack Connected Region and multi-tile attacks show the tapped tile's win chance, which moves with Normal, Extra and Double",
    "A refused attack says how much mustered manpower it needs from a flag within 10 tiles"
  ]
};
