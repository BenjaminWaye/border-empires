import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIC_CLEAR_SITE_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.12",
  title: "Clear relic sites",
  why: "Trees, mountains and resources poked through relic installations, and the locator beam stayed lit over a relic you could already see.",
  changes: [
    "Relics clear the trees from all 9 tiles they stand on.",
    "New worlds place relics only on open land with no mountains, water or resources under them.",
    "The locator beam disappears once the relic itself is on your map."
  ]
};
