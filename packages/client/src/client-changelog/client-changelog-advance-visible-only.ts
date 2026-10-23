import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const ADVANCE_VISIBLE_ONLY_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792528615493, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.20.2",
    title: "Advancing flags only chase enemies you can see",
    why: "Advancing flags expanded out into the fog toward enemies the player couldn't see, so they explored instead of holding the front.",
    changes: [
      "An advancing flag now only expands toward barbarians and rivals inside your vision; anything hidden in the fog is ignored",
      "An advance order counts as finished once no visible enemy is left in range"
    ]
  }
];
