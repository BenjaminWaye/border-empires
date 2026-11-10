import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MARCH_MAX_ROUTE_STEPS, planMusterTransitRoute, type DockLandingIndex, type TransitPoint } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";

export type MusterTransitDelayInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLanding: DockLandingIndex;
  /** The funding muster flag. */
  flag: TransitPoint;
  /** The owned tile the attack/claim launches from. */
  launch: TransitPoint;
};

const pointFromKey = (key: string): TransitPoint => {
  const [x, y] = key.split(",").map(Number);
  return { x: x!, y: y! };
};

/**
 * Travel time for a muster-funded automated ATTACK/EXPAND: the company's real
 * route from its flag to the launch tile (packages/shared muster-transit-route)
 * -- over land, and through a dock with a troop-transport crossing where the
 * straight walk would cross water. Same route the client draws the company
 * along. See runtime-frontier-command.ts for why automated attacks carry it.
 *
 * Cost: a straight walk over land (almost every fire) is checked tile by tile
 * and never searches. Only a walk that would cross water runs the bounded
 * search, at most MUSTER_MARCH_MAX_ROUTE_STEPS deep, and it stops as soon as
 * the launch tile is reached.
 */
export const musterTransitMs = (input: MusterTransitDelayInput): number => {
  const { tiles, dockLanding } = input;
  return planMusterTransitRoute({
    from: input.flag,
    to: input.launch,
    // Unknown coordinates (absent in unit-test worlds) count as land, as the march planner does.
    isPassable: (x, y) => {
      const tile = tiles.get(simulationTileKey(x, y));
      return !tile || tile.terrain === "LAND";
    },
    crossingsFrom: (x, y) => dockLanding.landingTileKeysByOriginDockKey.get(simulationTileKey(x, y))?.map(pointFromKey),
    maxSteps: MUSTER_MARCH_MAX_ROUTE_STEPS
  }).transitMs;
};
