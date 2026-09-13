// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_52: ClientChangelogEntry[] = [
  {
    createdAt: 1788904106588, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.08.05",
    title: "Fixed: Space View's Senate/Fleets/Settings tabs stacked instead of replacing each other",
    why: "Player-reported: clicking a different top-right tab in Space View while one was already open didn't close the previous one -- each of the three toggle buttons only ever flipped its own panel's visibility, with no idea the other two existed, so opening Fleets while Senate was open just stacked Fleets on top of it instead of replacing it.",
    changes: [
      "Opening the Senate, Fleets, or Settings tab in Space View now closes whichever of the other two was already open, so only one panel is ever visible at a time",
      "Clicking a tab's own button while it's already open still just closes it, unchanged"
    ]
  },
  {
    createdAt: 1788902995508, // frozen, 2ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.4",
    title: "Removed the Shard storage cap",
    why: "Shard was capped at just 3 in storage, one of the tightest caps in the game. With Wonder parts now also costing Shard on top of the finished Wonder, that cap meant Shard collected faster than it could be spent was wasted overflow instead of banked for the next build.",
    changes: [
      "Shard no longer has a storage cap -- collect and stockpile as much as you can gather"
    ]
  },
  {
    createdAt: 1788902995507, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.08.3.5",
    title: "Wonder parts now cost Shard, not just the finished Wonder",
    why: "Each Wonder's 3 prerequisite parts only ever cost manpower to build, with the Shard cost only charged on the final assembly. That let a player stockpile every part for free and made the Shard gate trivially easy to clear at the very end.",
    changes: [
      "Every Wonder part building now also costs 1 Shard to build, on top of its existing manpower cost",
      "A completed Wonder now consumes 5 Shard total across its build chain (3 for the parts, 2 for the final assembly), up from 2"
    ]
  }
  // "Fleets now take real build time..." dropped here: also landed via a
  // concurrent branch's own earlier-50.ts split, so keeping both would have
  // duplicated the entry (and its createdAt) in the combined changelog.
];
