import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STRANDED_FRONTIER_CLEANUP: ClientChangelogEntry[] = [
  {
    createdAt: 1791059877890, // frozen Date.now() value for this release
    introducedIn: "2026.10.03.1",
    title: "No more stranded frontier tiles",
    why: "Losing a settled tile to going broke, an Aether Lance or an airport bombardment could leave your frontier tiles beyond it owned forever, even though nothing connected them to your settled land anymore.",
    changes: [
      "Frontier tiles cut off from your settled land by tile shedding, an Aether Lance or an airport bombardment are now released straight away, like they already were after a capture or an abandon",
      "This also applies while you are logged out: tiles shed while you are away no longer leave orphaned frontier behind"
    ]
  }
];
