import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AETHER_PROTECTION_FIELD: ClientChangelogEntry[] = [
  {
    createdAt: 1792074933086, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "See which land Aether Towers protect",
    why: "There was no way to tell which enemy tiles were shielded from your Aether abilities, or which of your own tiles your towers were covering, without trying a cast.",
    changes: [
      "Selecting any Aether Tower, opening the Crystal (Aether abilities) tab in the tile menu, or aiming an Aether ability now tints every tile an Aether Tower is protecting right now: blue for your own and allied towers, red for enemy towers",
      "Only the tower owner's own tiles within 20 tiles are tinted, and towers on cooldown or unpowered are left out, matching what actually blocks a cast",
      "Enemy towers hidden in fog still tint the land of theirs you can see, and an enemy tower that is unpowered is correctly left out",
      "Aether ability targets grey out on exactly the tiles tinted red",
      "Works on both the 3D and 2D maps"
    ]
  },
  {
    createdAt: 1792108265294, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "Siphon land while its Aether Tower recharges",
    why: "Siphon was blocked by an enemy Aether Tower even while that tower was on cooldown, unlike every other Aether ability.",
    changes: [
      "You can now Siphon land whose Aether Tower is on cooldown or unpowered",
      "The siphon ends on its own as soon as that tower is back online (off cooldown and powered)"
    ]
  }
];
