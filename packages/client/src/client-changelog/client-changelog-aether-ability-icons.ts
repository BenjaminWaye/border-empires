import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const AETHER_ABILITY_ICONS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792038621394, // Date.now() captured once for this release.
    introducedIn: "2026.10.15.1",
    title: "Drawn icons for every Aether ability",
    why: "Abilities were marked with text symbols that looked different on every device, and Survey Sweep and Aether Purge showed a tent in the Crystal tab.",
    changes: [
      "Each Aether ability has its own icon showing what it does: a radar sweep for Survey Sweep, a watching eye for Reveal Empire, a crystal lance striking a banner for Aether Purge, a glowing span between pylons for Aether Bridge, and so on",
      "The icons appear in the tile menu's Crystal tab, on each ability's info card, and in Manifest details"
    ]
  },
];
