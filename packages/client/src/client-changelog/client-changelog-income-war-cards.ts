import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const INCOME_WAR_CARDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "One coin income figure, a war tally that matches the Chronicle, and War on enemy cards",
  why: "Playtesters saw three different coin incomes for one empire, a war tally of 0 tiles taken while the Chronicle counted 2, and an enemy still marked Met after the war began.",
  changes: [
    "The coin chip, Economy and your own profile now show the same net coin per day (income less upkeep), rounded the same way. A rival's profile says its figure is gross income, and Economic Hegemony's progress says gross coin/day.",
    "The trade screen's war tally shows the tiles each side took over the last 24 hours exactly as your Chronicle counts them, with the AI's own fading weighting on a separate line. The AI now also counts the tile a failed attack loses to the defender.",
    "An empire you are fighting reads War (in red, listed first) on the rivals strip, the Diplomacy list, the deal view and its profile.",
    "Diplomacy cards and the deal view say their tile count is garrisoned tiles, which is why frontier land changing hands doesn't move it."
  ]
};
