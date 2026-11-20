import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_UPGRADES_BEFORE_MANIFEST_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "AFC Upgrades no longer show retired choices",
  why: "New Houses opening AFC Upgrades before their first Manifest saw an old list (Frontier Doctrine, Dwarf Kingdom and others) that can no longer be installed.",
  changes: [
    "AFC Upgrades now shows this season's upgrade paths from the moment you land",
    "Before your first Manifest it tells you to progress your Manifest to unlock Upgrade I"
  ]
};
