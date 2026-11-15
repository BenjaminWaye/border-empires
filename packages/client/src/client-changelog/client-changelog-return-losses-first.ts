import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RETURN_LOSSES_FIRST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Coming back after a raid: losses first",
  why: "Players returning after an overnight attack were shown a truce offer from their attacker, sometimes over the loading screen, and patch notes, before any word of what they had lost.",
  changes: [
    "The Chronicle opens on Yours when something happened while you were away, never on Updates; what you lost is listed first.",
    "Truce and alliance offers wait until the map has loaded and you have closed the Chronicle.",
    "An offer from an empire that attacked you in the last day says so, and what it took."
  ]
};
