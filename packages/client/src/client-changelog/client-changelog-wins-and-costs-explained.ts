import type { ClientChangelogEntry } from "./client-changelog-data.js";

// createdAt is set where this is listed in client-changelog-data.ts, which is
// the only file the changelog gate (scripts/check-client-changelog-update.mjs) reads.
export const WINS_AND_COSTS_EXPLAINED_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.16",
  title: "Wins, AFC losses and prices that explain themselves",
  why: "Playtesters read a won capture as a loss, mistook a lost AFC for a lost town, and saw upkeep and prices that ignored their upgrades or changed without a reason.",
  changes: [
    "When your attack levels a settlement, the capture card says you did it instead of naming your own House",
    "Losing an AFC adds a Recent Events line that names it as an AFC, says who took it and, for your last one, that an AFC is not a town. The Chronicle row starts with the lost AFC",
    "The manpower breakdown and the respawn screen say AFC instead of \"capital\"",
    "A town's FOOD upkeep on the town screen, tile overview and economy panel now counts upgrades that waive FOOD slots, and the town screen shows how many slots are waived",
    "Manifest prices include the Calculating Engine's 10% discount, show the full price and the discount, and update when the wonder changes hands",
    "\"Need … manpower\" on a Relay Beacon or other garrison-and-build button names the garrison, expand and build parts of the total"
  ]
};
