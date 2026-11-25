import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIC_WAKE_ALERT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.24",
  title: "Rival relics are named on the map",
  why: "A rival's working relic showed only as a bare light column and a hollow box, often far away, with nothing saying what it was, and tapping it opened a scout flight plan.",
  changes: [
    "A rival's running relic now carries a plate on the map: Concordance relic, the House running it. Until you first scroll to it, a tab on the screen edge points to it with the distance.",
    "A relic signal in range gets a Relic signal plate instead of a bare column.",
    "Tapping a plate or the relic's tile opens its card, with Show and Send scout, instead of starting a scout flight plan.",
    "The first time you see another House running a relic, an alert names the House and the site.",
    "While you place scout waypoints or pick a march, a tap on a relic is a waypoint, not its card.",
    "On the minimap a relic is a diamond, and pressing it takes you to the relic itself, even when it is pinned to the edge."
  ]
};
