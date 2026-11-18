import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const THREE_D_RELOAD_STREAK_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Reloading no longer switches you to the 2D map",
  why: "Reloading a few times while the 3D map was still starting, for example through a connection outage, counted as 3D crashes. The game then switched to 2D and said 3D had crashed the browser.",
  changes: [
    "Only a real crash counts toward switching to the 2D map. Reloading or leaving the page while 3D starts up does not."
  ]
};
