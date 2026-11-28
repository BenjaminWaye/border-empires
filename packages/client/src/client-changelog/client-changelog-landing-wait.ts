import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LANDING_WAIT_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.28",
  title: "A House knocked out on a full map lands as soon as a site frees up",
  why: "A House with no free landing site only tried again when its player logged in, and the player saw an empty map with no word of why.",
  changes: [
    "While you are online, your House lands within about a minute of a free landing site opening",
    "Until then a notice says your House is waiting for a free landing site"
  ]
};
