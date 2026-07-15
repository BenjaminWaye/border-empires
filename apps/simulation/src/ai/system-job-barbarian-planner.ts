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
// on the shared vCPU. At/above the cap the barbarian takes no action, so it
// can never grow past ~100 via its own expansion; players eroding it below the
// cap let it act again, so it hovers at ≤100 and its export stays cheap.
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
    // Size cap: stop acting once at/over the cap so the barbarian can never
    // grow its own territory (and thus its per-churn export cost) unbounded.
    if (ownedTiles.length >= MAX_BARBARIAN_TILES) return null;

    const visible = deps.getVisibleToAnyNonBarbPlayer();
    if (visible.size === 0) return null;

    const t = now();
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
