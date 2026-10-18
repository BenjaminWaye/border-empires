import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PROSPECT_CLUE_SWIRL_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792324636538,
    introducedIn: "2026.10.18.1",
    title: "Calmer prospect clues",
    why: "Blackwood canopy turned whole forests black and planted dark trees on open ground, which looked odd, and ferrous dust showed rust-orange flecks although titanium is grey.",
    changes: [
      "Blackwood canopy: forests keep their normal colour; every few seconds a purple swirl rises out of the trees instead, and open ground shows nothing",
      "Ferrous dust: the flecks are now small grey titanium chips",
      "Once you've revealed a resource, its clue disappears from the map and the tile menu, since the deposits themselves now show",
      "Works on both the 3D and 2D maps"
    ]
  }
];
