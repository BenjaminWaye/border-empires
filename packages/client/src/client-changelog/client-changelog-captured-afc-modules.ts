import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CAPTURED_AFC_MODULES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.23",
  title: "Captured AFC modules unlock their buildings",
  why: "Taking a rival's AFC should let you use its machinery, not just look at it.",
  changes: [
    "A module on an AFC you captured unlocks its buildings, Fort tiers and Siege tiers for you, even if you never researched its Manifest. The AFC must be active and on settled ground.",
    "The module's abilities, such as Aether Purge or Aether EMP, still need the Manifest.",
    "AI Houses and auto-improve follow the same rule."
  ]
};
