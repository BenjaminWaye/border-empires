// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_59: ClientChangelogEntry[] = [
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
    createdAt: 1789017727268, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.10.1",
    title: "Muster flags now search a 10-tile radius instead of your whole empire, fixing server slowdowns during busy fights",
    why: "Both auto-fire modes searched by walking outward across every tile you own, every tick, for every raised flag. ADVANCE had a range limit but only applied it to the target it picked -- the search itself still crossed the entire empire and threw the far results away -- and MARCH had no limit at all. With several large empires fighting at once that became the server's heaviest work by far, which is what players saw as the game becoming unresponsive or reporting the simulation as unavailable.",
    changes: [
      "Muster flags (ADVANCE and MARCH) now look for targets within 10 tiles of the flag, instead of anywhere in your territory",
      "A MARCH can no longer divert to attack something on the far side of your empire; it stays on the local route toward its target, picking the shortest way there whether that means expanding or attacking",
      "No change to how a target is chosen within range -- only how far the search reaches"
    ]
  },
  {
    createdAt: 1789017727269, // frozen, 1ms after the "10-tile radius" entry -- keeps ordering stable
    introducedIn: "2026.09.10.2",
    title: "Fixed MARCH muster flags stalling out and \"fighting\" tiles nowhere near their target",
    why: "MARCH's candidate search only considered expanding onto neutral tiles inside the flag's fixed reach border, but claiming land outside reach has always been allowed (at the cost of out-of-reach decay). A flag whose target lay just past the reach edge found no candidate anywhere near the target, silently fell back to the cheapest candidate reachable through owned territory instead -- sometimes a fight on the far side of the empire -- and just sat there reporting it, with manpower staged and nothing actually happening.",
    changes: [
      "MARCH can now expand onto neutral land outside the flag's reach border, same as a manual EXPAND already could, so a march toward a just-out-of-reach target now actually walks there instead of stalling",
      "MARCH now refuses to fire on any candidate that isn't strictly closer to the target than the flag already is, so it can no longer wander off toward an unrelated fight while reporting itself as \"on track\"",
      "When a march genuinely has nowhere to go, the flag now reports it can't find a target instead of showing a misleading \"Fighting at (x, y)\" status"
    ]
  },
  {
    createdAt: 1789019365997, // frozen, 1ms after the MARCH-stall fix entry -- keeps ordering stable
    introducedIn: "2026.09.10.3",
    title: "Reverted Great City's second support ring",
    why: "Great City and Metropolis towns briefly drew support structures/tiles from a second ring (24 tiles instead of 8). That's reverted for now -- it added meaningful server cost to a hot per-tile lookup that every town of every tier paid, not just the towns actually using the second ring.",
    changes: [
      "Great City and Metropolis towns are back to the standard 8-tile support ring, same as every other tier",
      "The \"Upgrade City to Great City\" tile action no longer mentions a second ring of build tiles"
    ]
  }
];
