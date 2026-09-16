import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_64: ClientChangelogEntry[] = [
  {
    createdAt: 1789375785267, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Steampunk visual pass closes out the Economy, Domain, Tech Tree, Alliance, and mobile tip gaps",
    why: "A round of player feedback flagged five spots the earlier passes missed -- this pass closes them out.",
    changes: [
      "The Economy panel's resource cards, slot-source/occupant breakdown lines, and income/upkeep columns now use the brass/verdigris/ember palette instead of the old blue-gray",
      "Domain panel boxes -- the shard-network progress card, domain tier blocks, and domain choice/detail cards -- now use the brass/verdigris palette instead of the old dark-blue sci-fi box style",
      "The Tech Tree graph view -- tier headers, node cards, tech-card grid, and branch tags -- now uses the brass/parchment/verdigris palette (the tech detail modal/card was already reskinned in an earlier pass and is unchanged)",
      "The mobile bottom discovery-tip toast (the small floating \"first discovery\" card) now uses brass/parchment colors and Cinzel/Spectral fonts instead of its old amber-on-navy look",
      "The Alliance tab/panel -- request cards, accept/reject/break/cancel actions, and section chrome -- now uses the brass/verdigris (allied) and ember (break/reject) palette instead of its old plain dark GitHub-style look"
    ]
  }
];
