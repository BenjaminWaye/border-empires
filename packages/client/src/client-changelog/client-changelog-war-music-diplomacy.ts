import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const WAR_MUSIC_DIPLOMACY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792527392771, // Date.now() captured once for this release.
    introducedIn: "2026.10.20.2",
    title: "War music respects truces and alliances",
    why: "War music could play while every empire you had met was at truce or allied with you.",
    changes: [
      "Your muster flags only play war music when a barbarian or an empire you aren't at truce or allied with is in reach",
      "Battles between other empires no longer start war music; only fights you're part of do",
      "A truce partner's or ally's muster flag on your border no longer starts war music"
    ]
  }
];
