import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const BARBARIAN_PLAYER_ID = "barbarian-1";
export const BARBARIAN_TILE_COOLDOWN_MS = 15_000;

export type BarbarianPlannerDeps = {
  readonly tilesByKey: ReadonlyMap<string, PlannerTileView>;
  readonly resolveOwnedTiles: (player: PlannerPlayerView) => PlannerTileView[];
  readonly getDockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  readonly now?: () => number;
  readonly cooldownMs?: number;
};

export type BarbarianPlanner = {
  readonly choose: (
    player: PlannerPlayerView,
    clientSeq: number,
    issuedAt: number
  ) => CommandEnvelope | null;
  readonly cooldownByTileKey: ReadonlyMap<string, number>;
};

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
];

export const createBarbarianPlanner = (deps: BarbarianPlannerDeps): BarbarianPlanner => {
  const now = deps.now ?? (() => Date.now());
  const cooldownMs = deps.cooldownMs ?? BARBARIAN_TILE_COOLDOWN_MS;
  const cooldownByTileKey = new Map<string, number>();

  const hasNonBarbarianNeighbor = (tile: PlannerTileView): boolean => {
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const neighbor = deps.tilesByKey.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor) continue;
      if (neighbor.ownerId && neighbor.ownerId !== BARBARIAN_PLAYER_ID) return true;
    }
    return false;
  };

  const choose = (
    player: PlannerPlayerView,
    clientSeq: number,
    issuedAt: number
  ): CommandEnvelope | null => {
    const ownedTiles = deps.resolveOwnedTiles(player);
    if (ownedTiles.length === 0) return null;

    const t = now();
    const eligibleTiles: PlannerTileView[] = [];
    for (const tile of ownedTiles) {
      const tileKey = `${tile.x},${tile.y}`;
      const cooldownUntil = cooldownByTileKey.get(tileKey);
      if (cooldownUntil !== undefined && cooldownUntil > t) continue;
      if (!hasNonBarbarianNeighbor(tile)) continue;
      eligibleTiles.push(tile);
    }
    if (eligibleTiles.length === 0) return null;

    const command = chooseNextOwnedFrontierCommandFromLookup(
      deps.tilesByKey,
      eligibleTiles,
      player.id,
      clientSeq,
      issuedAt,
      "system-runtime",
      { canAttack: true, canExpand: true, dockLinksByDockTileKey: deps.getDockLinksByDockTileKey() }
    ) ?? null;

    if (command) {
      try {
        const payload = JSON.parse(command.payloadJson) as {
          fromX?: unknown;
          fromY?: unknown;
          toX?: unknown;
          toY?: unknown;
        };
        const until = t + cooldownMs;
        // Cooldown the source AND the target: walks release the source
        // (so a source-only cooldown is wasted on a neutral tile), and the
        // freshly-created barb at the target would otherwise act on the very
        // next tick — the entire point of the cooldown is to keep that from
        // chaining when a player breaches a cluster.
        if (typeof payload.fromX === "number" && typeof payload.fromY === "number") {
          cooldownByTileKey.set(`${payload.fromX},${payload.fromY}`, until);
        }
        if (typeof payload.toX === "number" && typeof payload.toY === "number") {
          cooldownByTileKey.set(`${payload.toX},${payload.toY}`, until);
        }
      } catch {
        // ignore — cooldown best-effort
      }
    }
    return command;
  };

  return { choose, cooldownByTileKey };
};
