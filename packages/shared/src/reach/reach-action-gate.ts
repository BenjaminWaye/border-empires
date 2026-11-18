import { structureSkipsSettledRequirement } from "../structure-registry-index.js";
import { settleIgnoresReach, type SettleReachExemptionTile } from "./reach-settle-exemption.js";

/**
 * The simulation's reach rules for an owned FRONTIER tile, in one place so the
 * client's buttons, tile-menu header and copy agree with what the sim accepts.
 *
 * - Garrison (SETTLE, runtime.ts handleSettleCommand): the tile must be inside
 *   the player's own reach border, unless it is exempt (settleIgnoresReach:
 *   towns, docks, captured buildings).
 * - Build on FRONTIER (runtime-structure-command-handlers.ts): every structure
 *   except the siege ladder needs SETTLED, so it garrisons first and inherits
 *   the garrison rule. The siege ladder skips SETTLED and only needs the tile
 *   inside *someone's* reach border (yours or a rival's).
 *
 * Reach itself is the persistent border the sim pushes as REACH_UPDATE:
 * TOWN_REACH_RADIUS / OUTPOST_REACH_RADIUS tiles (Chebyshev) from each settled
 * anchor, spreading only over land (mountains and sea stop it), and clipped
 * where a rival's live reach already holds the ground.
 */
export type FrontierReachInput = {
  /** Tile is inside the acting player's own reach border. */
  inOwnReach: boolean;
  /** Tile is inside any player's reach border (own or rival). */
  inAnyReach: boolean;
};

/** True when the sim would reject a Garrison on this tile as OUT_OF_REACH. */
export const garrisonBlockedByReach = (tile: SettleReachExemptionTile, inOwnReach: boolean): boolean =>
  !inOwnReach && !settleIgnoresReach(tile);

/** True when the sim would reject this build on an owned FRONTIER tile as OUT_OF_REACH (directly, or via its garrison step). */
export const frontierBuildBlockedByReach = (tile: SettleReachExemptionTile, structureType: string, input: FrontierReachInput): boolean =>
  structureSkipsSettledRequirement(structureType) ? !input.inAnyReach && !input.inOwnReach : garrisonBlockedByReach(tile, input.inOwnReach);

/** Short player-facing label for an OUT_OF_REACH block (buttons, alerts). */
export const OUT_OF_REACH_LABEL = "Outside your reach";
