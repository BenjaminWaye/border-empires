import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_RELIC_BUILD_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.10",
  title: "Clear ground for AFCs and relics",
  why: "AFCs and relics reserve their center tile and all eight surrounding tiles.",
  changes: [
    "New buildings, including forts, must go outside the 3×3 footprint of AFCs and relics.",
    "An AFC landing area must be clear of towns, docks, resource deposits, buildings, and the nine tiles reserved by any other AFC or relic."
  ]
};
