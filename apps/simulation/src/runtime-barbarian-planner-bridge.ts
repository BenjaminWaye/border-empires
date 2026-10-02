/**
 * Drives the barbarian planner (ai/system-job-barbarian-planner.ts) from inside
 * the simulation process, for the non-worker system producer (local dev and
 * tests). Staging/production run the same planner inside the system job worker,
 * so both paths now share one set of barbarian rules: act only while seen,
 * per-tile in-flight + rest, attack budget, territory cap.
 */
import type { DomainTileState } from "@border-empires/game-domain";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { BARBARIAN_PLAYER_ID, createBarbarianPlanner } from "./ai/system-job-barbarian-planner.js";

// Same floor the worker producer uses between recomputes of the seen set.
const SEEN_SET_REFRESH_MS = 1_000;

export type RuntimeBarbarianBridgeDeps = {
  readonly tiles: ReadonlyMap<string, DomainTileState>;
  readonly dockLinksByDockTileKey: () => ReadonlyMap<string, readonly string[]>;
  readonly territoryTileKeys: () => ReadonlySet<string>;
  readonly tileKeySetToTiles: (keys: ReadonlySet<string>) => DomainTileState[];
  readonly seenBarbTileKeys: () => string[];
  readonly now: () => number;
};

export type RuntimeBarbarianBridge = {
  readonly choose: (clientSeq: number, issuedAt: number) => CommandEnvelope | undefined;
  readonly settle: (commandId: string, settledAt: number) => void;
};

export const createRuntimeBarbarianBridge = (deps: RuntimeBarbarianBridgeDeps): RuntimeBarbarianBridge => {
  let seen: ReadonlySet<string> = new Set();
  let seenComputedAt = Number.NEGATIVE_INFINITY;
  const planner = createBarbarianPlanner({
    tilesByKey: deps.tiles,
    resolveOwnedTiles: () => deps.tileKeySetToTiles(deps.territoryTileKeys()),
    getDockLinksByDockTileKey: deps.dockLinksByDockTileKey,
    getVisibleToAnyNonBarbPlayer: () => {
      const t = deps.now();
      if (t - seenComputedAt >= SEEN_SET_REFRESH_MS) {
        seen = new Set(deps.seenBarbTileKeys());
        seenComputedAt = t;
      }
      return seen;
    },
    now: deps.now
  });
  return {
    choose: (clientSeq, issuedAt) =>
      planner.choose({ id: BARBARIAN_PLAYER_ID, tileCollectionVersion: 0, territoryTileKeys: [] }, clientSeq, issuedAt) ?? undefined,
    settle: planner.settle
  };
};
