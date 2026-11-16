/**
 * Refinery reach (docs/territory-development-plan.md, Phase 2 rule 4): a
 * strategic deposit field is in reach of a town when any of its tiles is at
 * most this many 8-way steps over LAND from the town tile. Worldgen already
 * guarantees every strategic field it places is in reach of some town
 * (game-domain server-worldgen-strategic-reach.ts).
 */
export const REFINERY_REACH_LAND_TILES = 10;
