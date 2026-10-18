import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_CUT_OFF_BUILDINGS_SURVIVE: ClientChangelogEntry[] = [
  {
    createdAt: 1792321140687,
    introducedIn: "2026.10.18.2",
    title: "Captured buildings survive being cut off",
    why: "A captured building could vanish if the tile was cut off while it was settling, leaving an empty settled tile.",
    changes: ["Cut-off frontier tiles keep finished forts, observatories and economic buildings, like abandoned tiles already did"]
  }
];
