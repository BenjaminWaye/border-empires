import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_93: ClientChangelogEntry[] = [
  {
    createdAt: 1788986490659, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.09.07",
    title: "Restored Town's manpower cap after the population-tier rebalance made Thunder Bastion forts unbuildable at Town tier",
    why: "Halving every tier's manpower-cap increase (including Town's) dropped a Town-tier town's manpower cap to 945 -- below the 960 manpower a Thunder Bastion fort costs, so no Town-tier player could ever build the top fort tier. Only City-and-above tiers were meant to have their increase halved.",
    changes: [
      "Town's manpower cap/regen is back to its original (unhalved) value: 300 cap / +0.42 per-min regen, same as before the population-tier rebalance",
      "City, Great City, and Metropolis keep their halved per-tier increase, now stacking on top of Town's restored value: City 450 cap, Great City 750 cap, Metropolis 1,350 cap"
    ]
  },
  {
    createdAt: 1789382408131, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.14.01",
    title: "AI empires can now build Titanium Bastion and Thunder Bastion forts again",
    why: "Fort tiers pay their Titanium cost as a resource-slot occupation, not a stockpile spend, but the AI's build-planner still checked the opponent's Titanium stockpile against the old (already-retired) per-tier cost before proposing a fort -- since Titanium no longer accumulates as a stockpile, that check always failed. AI opponents with Fortified Walls or Steelworking researched could never actually build the fort tier those techs unlock.",
    changes: [
      "AI-controlled empires now build Titanium Bastion and Thunder Bastion forts once they have the researching tech and enough manpower, instead of silently failing every attempt",
      "No change to human players -- fort build costs on the tile-menu and command flow were never affected by this"
    ]
  }
];
