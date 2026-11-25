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

export const CAPTURED_AFC_MODULE_ABILITIES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.25",
  title: "Captured AFC modules cast their abilities",
  why: "A module is the machine itself, so whoever holds it can use all of it.",
  changes: [
    "A module on an AFC you captured now also lets you cast its abilities, such as Aether Purge, Aether EMP, Aether Bridge, Aether Wall, Siphon, Create and Remove Mountain, and Retort Transmutation, without researching its Manifest.",
    "Augury Office abilities (Reveal Empire, Survey Sweep) are a crew, not a module, and still need the Manifest.",
    "You keep these abilities only while you hold the AFC. Lose it and a running Siphon cast from its module ends.",
    "AI Houses follow the same rule. A captured Aether Resonance Core lets them build Aether Towers."
  ]
};
