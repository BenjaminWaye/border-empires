import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const RELIC_REVEAL_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Relics reveal their power once garrisoned",
  why: "A relic's effect was listed before anyone had brought it online, and the Field Generator's reach was too small to matter.",
  changes: [
    "A relic's effect now shows only once it is garrisoned and active",
    "The Ancient Field Generator now covers garrisoned land within 6 tiles, up from 3",
    "The relic window now matches the rest of the game's panels"
  ]
};
