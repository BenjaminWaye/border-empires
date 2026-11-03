import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AFC_V3_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793647651075, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "AFC upgrades reworked, and Resonance Hijack",
    why: "Several AFC upgrades were too weak to pick, hard to judge, or only worked with allies you rarely have early on.",
    changes: [
      "Resonance Hijack (Oracle V) replaces Command-Signal Intercept: take over an enemy Aether Tower that has spent all its shots or is suppressed. The takeover runs 10 minutes, its owner is alerted (and emailed) and sees your casting tower; if they take, suppress or unpower it, the hijack fails. Once per 24 hours.",
      "Enemy towers you can hijack are marked on the map, and your own towers warn you when they are down to their last shot.",
      "Vanguard: Planetary Defense tiles pay a 25 Coin bounty; Battlefield Momentum is +10% per stack up to +50%; Breakthrough forces a second tile to surrender at full Momentum, with a breach effect on the map.",
      "Bastion is reordered: Citadel Reserves (I) keeps towns growing during nearby fighting, Fortification Patterns (II) lets you build Forts without the tech and makes your first three Forts free, Armour Production Mandate is now III.",
      "Dominion: Relays build instantly and ten need no FOOD slot; Colonial Charter (II) gives every garrisoned town a free Incubation Engine; Expansion Doctrine (IV) prices expansion on half your frontier and halves garrison manpower; Universal Fabrication Line also builds everything instantly.",
      "Chancery: Envoy Accreditation pays +10% Coin per truce or alliance (up to +50%); Diplomatic Corps (II) makes AI empires friendlier and halves the truces you buy; Allied Levies (III) adds 15% manpower per ally (up to 3).",
      "Metropolitan Concession also lowers the Economic Hegemony lead you need from 33% to 20%.",
      "Upgrade cards now show which earlier picks they work with."
    ]
  }
];
