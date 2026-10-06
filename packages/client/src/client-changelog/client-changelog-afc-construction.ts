import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_AFC_CONSTRUCTION: ClientChangelogEntry[] = [
  {
    createdAt: 1791005381000, // frozen at the commit that added this entry (a live Date.now() makes What's New reopen on every load)
    introducedIn: "2026.10.02.2",
    title: "Build and redeploy Automated Fabrication Complexes",
    why: "AFC modules were fixed to their first location, leaving no way to spread a House's manufacturing capability across a larger empire.",
    changes: [
      "Empty settled land now offers Build AFC, with the price doubling for each AFC you control",
      "A researched module can be called down to another AFC you control; captured module copies stay where they were captured",
      "Additional AFCs host modules and reach, but no longer add extra baseline Coin or Manpower"
    ]
  }
];
