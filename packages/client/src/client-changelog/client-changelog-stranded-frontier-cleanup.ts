import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_STRANDED_FRONTIER_CLEANUP: ClientChangelogEntry[] = [
  {
    createdAt: 1791059877890, // frozen Date.now() value for this release
    introducedIn: "2026.10.03.1",
    title: "No more stranded frontier tiles",
    why: "Losing a settled tile to going broke, an Aether Lance, an airport bombardment or a Create Mountain could leave your frontier tiles beyond it owned forever, even though nothing connected them to your settled land anymore.",
    changes: [
      "Frontier tiles cut off from your settled land by tile shedding, an Aether Lance, an airport bombardment or a Create Mountain are now released straight away, like they already were after a capture or an abandon",
      "This also applies while you are logged out: tiles shed while you are away no longer leave orphaned frontier behind",
      "Frontier tiles that were already cut off are cleaned up the first time anyone's map view covers them, so leftover enemy tiles no longer linger on the map",
      "Expanding or attacking from a cut-off frontier tile now releases it instead of letting cut-off territory keep growing. Tiles that are only outside your reach (the slow decay timer) but still connected can still be used to expand"
    ]
  }
];
