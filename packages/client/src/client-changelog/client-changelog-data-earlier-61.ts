// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_61: ClientChangelogEntry[] = [
  {
    createdAt: 1789225435144, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.13.03",
    title: "Siege Battery/Tower/Dread Tower fire on their own attacking battles (true-3D map only)",
    why: "Siege structures gave a static damage bonus but never visibly reacted to the fights they were boosting.",
    changes: [
      "When your attack starts a battle and you own a nearby Siege Battery/Tower/Dread Tower, it snaps to aim and fires a purple Umbrite explosion on the battle tile -- attacker-owned structures only, cosmetic, no change to combat odds",
      "True-3D renderer only for now -- 2D canvas fallback players won't see it"
    ]
  },
  {
    createdAt: 1788986490659, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.07",
    title: "Restored Town's manpower cap after the population-tier rebalance made Thunder Bastion forts unbuildable at Town tier",
    why: "Halving every tier's manpower-cap increase (including Town's) dropped a Town-tier town's manpower cap to 945 -- below the 960 manpower a Thunder Bastion fort costs, so no Town-tier player could ever build the top fort tier. Only City-and-above tiers were meant to have their increase halved.",
    changes: [
      "Town's manpower cap/regen is back to its original (unhalved) value: 300 cap / +0.42 per-min regen, same as before the population-tier rebalance",
      "City, Great City, and Metropolis keep their halved per-tier increase, now stacking on top of Town's restored value: City 450 cap, Great City 750 cap, Metropolis 1,350 cap"
    ]
  }
];
