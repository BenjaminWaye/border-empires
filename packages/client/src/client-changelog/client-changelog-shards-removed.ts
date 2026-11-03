import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const SHARDS_REMOVED_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793655662084, // Date.now() captured once for this entry.
    introducedIn: "2026.11.02",
    title: "Shards removed",
    why: "Shards never had a clear role: they paid for Monuments, refilled manpower and changed hands in deals, but the story never explained them.",
    changes: [
      "Shard rain, shard caches and the Shard counter are gone, and any Shards you held are removed",
      "Monuments now cost manpower and a Crystal slot only, with no Shards",
      "Doctrine domains from tier 2 up now cost coin only, with no Shards",
      "Shard Mobilization and the shard rain that favoured empires that had lost land are gone",
      "Deals and gifts trade Coin and resource supply only; pending offers that included Shards are withdrawn"
    ]
  }
];
