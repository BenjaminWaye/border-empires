import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const COMBAT_LEGIBILITY_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "See how your march fights went",
  why: "A march's battles only reached the flag's Recent combat tab, a march over empty land read \"Fighting\", region attacks hid their odds, and a short flag was blamed on the wrong tile.",
  changes: [
    "Battles a marching flag fights now show their result card; several results in a row add up to one tally (won, lost, manpower lost) instead of stacking",
    "A march stepping onto unclaimed land reads \"Claiming (x, y)\" instead of \"Fighting at (x, y)\"",
    "The March To sheet says how much manpower each tile claimed on the way costs",
    "Attack Connected Region and multi-tile attacks show the tapped tile's win chance, which moves with Normal, Extra and Double",
    "A refused attack says how much mustered manpower it needs from a flag within 10 tiles"
  ]
};
