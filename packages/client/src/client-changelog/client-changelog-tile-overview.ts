import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_TILE_OVERVIEW: ClientChangelogEntry[] = [
  {
    createdAt: 1789926100464, // frozen, 1ms after the waystation overview entry below
    introducedIn: "2026.09.25.1",
    title: "The tile overview now leads with what's special about the tile",
    why: "Waystations, buildings, natural wonders and shard sites were buried under generic ownership text like \"Frontier land is visible control\", and the waystation was a single plain sentence.",
    changes: [
      "Buildings, waystations, natural wonders and shard sites now appear at the top of the tile overview, above the generic frontier/settled text",
      "Waystations get their own block with Status (Dormant/Active), what they granted and who activated them"
    ]
  }
];
