import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_SPECIALIZATIONS_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1792322458399, // Date.now() frozen for this release.
  introducedIn: "2026.10.18.1",
  title: "Six AFC specializations for new campaigns",
  why: "Domains competed with Manifest purchases and stopped shaping late-campaign play.",
  changes: [
    "Commissioning a Manifest tier unlocks a free AFC upgrade choice, with six paths across five tiers",
    "Vanguard, Bastion, Dominion, Exchequer, Oracle and Chancery support conquest, defense, expansion, a profitable core, aether operations and diplomacy",
    "Existing campaigns keep their paid choices and bonuses; the complete new rules apply to new campaigns"
  ]
}];
