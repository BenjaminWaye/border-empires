import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AETHER_PROTECTION_FIELD: ClientChangelogEntry[] = [
  {
    createdAt: 1792074933086, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.15.1",
    title: "See which land Aether Towers protect",
    why: "There was no way to tell which enemy tiles were shielded from your Aether abilities, or which of your own tiles your towers were covering, without trying a cast.",
    changes: [
      "Selecting any Aether Tower, opening the Crystal (Aether abilities) tab in the tile menu, or aiming an Aether ability now tints every tile an Aether Tower is protecting right now: blue for your own and allied towers, red for enemy towers",
      "Only the tower owner's own tiles within 20 tiles are tinted, and towers on cooldown are left out, matching what actually blocks a cast",
      "Enemy towers you can't currently see aren't shown, so untinted enemy land can still be protected by a hidden tower",
      "Works on both the 3D and 2D maps"
    ]
  }
];
