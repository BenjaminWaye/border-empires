import type { DomainTileState } from "@border-empires/game-domain";
import { MUSTER_MARCH_MAX_ROUTE_STEPS, planMusterTransitRoute, type DockLandingIndex, type MusterTransitRoute, type TransitPoint } from "@border-empires/shared";
import { simulationTileKey } from "../seed-state/seed-state.js";
import { activeAetherBridgeNeighborKeysForPlayer } from "../runtime-encirclement-application.js";
import type { ActiveAetherBridgeView } from "../runtime-types.js";

export type MusterTransitDelayInput = {
  tiles: ReadonlyMap<string, DomainTileState>;
  dockLanding: DockLandingIndex;
  /** The marching player: only their own docks can start a crossing, as for a dock attack. */
  playerId: string;
  /** The marching player's allies: their land, like the player's own, is friendly ground to march through. */
  allies?: ReadonlySet<string>;
  activeAetherBridgesForPlayer: (playerId: string) => readonly ActiveAetherBridgeView[];
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
 * Cost: a straight walk over land and friendly or neutral ground (almost
 * every fire) is checked tile by tile and never searches. Only a walk that
 * would cross water, mountains or hostile land runs the search, and it stops
 * as soon as it reaches the launch tile. Hostile land is only weighted
 * (MUSTER_HOSTILE_STEP_COST), never barred, and the launch tile was itself
 * reached by ADVANCE's or MARCH's own search over land, the player's docks
 * and bridges -- so the search finds a route at most that many times the
 * straight one's cost rather than flooding its whole budget, barring a
 * terrain change since.
 */
export const musterTransitMs = (input: MusterTransitDelayInput): number => musterTransitRoute(input).transitMs;

/** The route musterTransitMs times, legs included (an insurgent march sends it to the client: camp-march.ts). */
export const musterTransitRoute = (input: MusterTransitDelayInput): MusterTransitRoute => {
  const { tiles, dockLanding, playerId } = input;
  let bridges: ReadonlyMap<string, readonly string[]> | undefined;
  return planMusterTransitRoute({
    from: input.flag,
    to: input.launch,
    // Unknown coordinates (absent in unit-test worlds) count as land, as the march planner does.
    isPassable: (x, y) => {
      const tile = tiles.get(simulationTileKey(x, y));
      return !tile || tile.terrain === "LAND";
    },
    // Troops go round land held by anyone but the player and their allies when the way round is short.
    isHostile: (x, y) => {
      const ownerId = tiles.get(simulationTileKey(x, y))?.ownerId;
      return !!ownerId && ownerId !== playerId && !input.allies?.has(ownerId);
    },
    crossingsFrom: (x, y) => {
      const key = simulationTileKey(x, y);
      if (tiles.get(key)?.ownerId !== playerId) return undefined;
      return dockLanding.landingTileKeysByOriginDockKey.get(key)?.map(pointFromKey);
    },
    bridgesFrom: (x, y) => {
      bridges ??= activeAetherBridgeNeighborKeysForPlayer({ activeAetherBridgesForPlayer: (id) => [...input.activeAetherBridgesForPlayer(id)] }, playerId);
      return bridges.get(simulationTileKey(x, y))?.map(pointFromKey);
    },
    maxSteps: MUSTER_MARCH_MAX_ROUTE_STEPS
  });
};
