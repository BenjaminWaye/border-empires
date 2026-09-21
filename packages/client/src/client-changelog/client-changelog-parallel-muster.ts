import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_PARALLEL_MUSTER: ClientChangelogEntry[] = [
  {
    createdAt: 1789852272082,
    introducedIn: "2026.09.19.2",
    title: "Muster flags can now keep several attacks moving at once",
    why: "An ADVANCE or MARCH flag previously stopped after its first attack until the combat or expansion timer finished, leaving nearby fronts idle even when the flag had enough mustered manpower.",
    changes: [
      "Each muster flag can now have up to three attacks or expansions active in parallel",
      "Mustered manpower already committed to an active attack is reserved before the next attack is launched",
      "The muster status shows when multiple actions are active"
    ]
  }
];
