import { chooseNextOwnedFrontierCommandFromLookup } from "./frontier-command-planner.js";
import type { PlannerPlayerView, PlannerTileView } from "./planner-world-view.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

export const BARBARIAN_PLAYER_ID = "barbarian-1";
export const BARBARIAN_TILE_COOLDOWN_MS = 15_000;

// Hard cap on barbarian territory. An uncapped barbarian on staging grew to
// 941 tiles (vs prod's ~126); the sim main thread re-exports the barbarian's
// full planner view (O(territory)) on every one of those tiles' ownership
// changes, and with the barbarian constantly being eaten by AI that re-export
// churned continuously — the dominant sim-thread cost, starving gateway logins
// on the shared vCPU. At/above the cap the barbarian self-erodes (releases one
// of its own tiles back to neutral each cycle) instead of expanding, so it
// actively shrinks toward the cap rather than sitting frozen forever waiting
// for players to attack it — an already-oversized barbarian (e.g. staging's
// existing 941-tile one) recovers on its own.
export const MAX_BARBARIAN_TILES = 100;

export type BarbarianPlannerDeps = {
  readonly tilesByKey: ReadonlyMap<string, PlannerTileView>;
  readonly resolveOwnedTiles: (player: PlannerPlayerView) => PlannerTileView[];
  readonly getDockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  /** Set of tile keys currently visible to at least one non-barbarian player.
   *  A barb tile is eligible to plan iff its tile key is in this set. Called
   *  once per `choose()`; callers cache + invalidate the union themselves
   *  (vision recomputation is the expensive part — keep it off this hot path). */
  readonly getVisibleToAnyNonBarbPlayer: () => ReadonlySet<string>;
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

/**
 * Release one of the barbarian's own tiles back to neutral via UNCAPTURE_TILE.
 * Picks the first tile not on cooldown (deterministic — resolveOwnedTiles
 * order is stable) so erosion doesn't immediately re-target the same tile if
 * a prior release command is still in flight or got rejected.
 */
const chooseErosionCommand = (
  ownedTiles: readonly PlannerTileView[],
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  nowMs: number,
  cooldownByTileKey: Map<string, number>,
  cooldownMs: number
): CommandEnvelope | null => {
  for (const tile of ownedTiles) {
    const tk = `${tile.x},${tile.y}`;
    const cooldownUntil = cooldownByTileKey.get(tk);
    if (cooldownUntil !== undefined && cooldownUntil > nowMs) continue;
    cooldownByTileKey.set(tk, nowMs + cooldownMs);
    return {
      commandId: `system-runtime-${playerId}-${clientSeq}-${issuedAt}`,
      sessionId: `system-runtime:${playerId}`,
      playerId,
      clientSeq,
      issuedAt,
      type: "UNCAPTURE_TILE",
      payloadJson: JSON.stringify({ x: tile.x, y: tile.y })
    };
  }
  return null;
};

export const createBarbarianPlanner = (deps: BarbarianPlannerDeps): BarbarianPlanner => {
  const now = deps.now ?? (() => Date.now());
  const cooldownMs = deps.cooldownMs ?? BARBARIAN_TILE_COOLDOWN_MS;
  const cooldownByTileKey = new Map<string, number>();

  const choose = (
    player: PlannerPlayerView,
    clientSeq: number,
    issuedAt: number
  ): CommandEnvelope | null => {
    const ownedTiles = deps.resolveOwnedTiles(player);
    if (ownedTiles.length === 0) return null;
    const t = now();
    // Size cap: at/over the cap, release one of its own tiles back to neutral
    // instead of expanding — actively erodes an oversized barbarian back
    // toward the cap rather than freezing it in place forever.
    if (ownedTiles.length >= MAX_BARBARIAN_TILES) {
      return chooseErosionCommand(ownedTiles, player.id, clientSeq, issuedAt, t, cooldownByTileKey, cooldownMs);
    }

    const visible = deps.getVisibleToAnyNonBarbPlayer();
    if (visible.size === 0) return null;

    const eligibleTiles: PlannerTileView[] = [];
    for (const tile of ownedTiles) {
      const tileKey = `${tile.x},${tile.y}`;
      const cooldownUntil = cooldownByTileKey.get(tileKey);
      if (cooldownUntil !== undefined && cooldownUntil > t) continue;
      if (!visible.has(tileKey)) continue;
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
