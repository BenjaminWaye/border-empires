// Stage 5 visibility-classification / per-player visible-state extraction
// out of runtime.ts (see AGENTS.md / docs/agents/topic-runbooks.md for the
// god-class breakup plan). Pure relocations of existing runtime.ts method
// bodies into free functions that take their dependencies explicitly via
// RuntimeVisibilityContext, mirroring the build*Context pattern used in
// Stages 1-4 (runtime-town-network.ts). No behavior was changed — only
// moved.
//
// HIGHER RISK than the sibling runtime-export.ts: this is the client-facing
// wire surface that decides exactly which tiles/state each player is sent
// (exportVisibleStateForPlayer and friends). The visibilityCoverage and
// barbActivationVisibilityCache Maps stay owned (as `this.*` fields) by
// SimulationRuntime and are threaded in via the context — they are
// invalidated from many other call sites in runtime.ts, so ownership must
// not move here, exactly like Stage 4's caution around
// townNetworkCacheByPlayer.
//
// Context types are derived via `Parameters<typeof impl>[0]` from the
// already-typed impl functions in ../runtime-visibility-classifier.ts and
// ../runtime-visible-state.ts rather than re-declared by hand, so this file
// cannot silently drift out of sync with those input contracts.
import type { DomainTileState } from "@border-empires/game-domain";
import type { SimulationTileWireDelta } from "../runtime-types.js";
import {
  classifyVisibilityForPlayer as classifyVisibilityForPlayerImpl,
  type RuntimeVisibilityClassification
} from "../runtime-visibility-classifier.js";
import {
  emitVisibilityAudit as emitVisibilityAuditImpl,
  exportBarbActivationVisibleUnion as exportBarbActivationVisibleUnionImpl,
  exportTilesInAreaForPlayer as exportTilesInAreaForPlayerImpl,
  exportVisibleStateForPlayer as exportVisibleStateForPlayerImpl,
  exportVisibleStateForPlayerAsync as exportVisibleStateForPlayerAsyncImpl,
  getBarbActivationVisionSignature as getBarbActivationVisionSignatureImpl
} from "../runtime-visible-state.js";
import type { MainThreadTaskTracker } from "../main-thread-task-tracker/main-thread-task-tracker.js";

export type RuntimeClassifyVisibilityContext = Omit<Parameters<typeof classifyVisibilityForPlayerImpl>[0], "playerId"> & {
  trackSyncMainThreadTask?: MainThreadTaskTracker["trackSync"];
};

// Named so an event_loop_blocked incident can see this instead of an empty
// mainThreadTasks — classification itself is now an O(territory) read of
// the incrementally-maintained coverage cache (see
// visibility-coverage-cache.ts), but dock-reveal collection can still scan
// every dock link, so this stays wrapped.
export function classifyVisibilityForPlayerForRuntime(
  ctx: RuntimeClassifyVisibilityContext,
  playerId: string
): RuntimeVisibilityClassification {
  const run = (): RuntimeVisibilityClassification => classifyVisibilityForPlayerImpl({ ...ctx, playerId });
  return ctx.trackSyncMainThreadTask
    ? ctx.trackSyncMainThreadTask("classify_visibility_for_player", { playerId }, run)
    : run();
}

export function getBarbActivationVisionSignatureForRuntime(
  ctx: Parameters<typeof getBarbActivationVisionSignatureImpl>[0]
): string {
  return getBarbActivationVisionSignatureImpl(ctx);
}

export function exportBarbActivationVisibleUnionForRuntime(
  ctx: Parameters<typeof exportBarbActivationVisibleUnionImpl>[0]
): { keys: string[]; signature: string } {
  return exportBarbActivationVisibleUnionImpl(ctx);
}

export function emitVisibilityAuditForRuntime(ctx: Parameters<typeof emitVisibilityAuditImpl>[0]): void {
  emitVisibilityAuditImpl(ctx);
}

export type RuntimeVisibleStateContext = Omit<Parameters<typeof exportVisibleStateForPlayerImpl>[0], "playerId">;

export function exportVisibleStateForPlayerForRuntime(
  ctx: RuntimeVisibleStateContext,
  playerId: string
): ReturnType<typeof exportVisibleStateForPlayerImpl> {
  return exportVisibleStateForPlayerImpl({ ...ctx, playerId });
}

// Async variant that yields between heavy sections so a big-territory
// bootstrap build doesn't block the main thread contiguously — see
// classifyVisibilityForPlayerForRuntime (O(territory×radius²),
// trackSync-wrapped above) and its ~13k-tile/1.5M-iteration
// watchdog-grazing note. Output parity with sync covered by
// runtime.export-visible-async.test.ts.
export async function exportVisibleStateForPlayerAsyncForRuntime(
  ctx: RuntimeVisibleStateContext,
  playerId: string,
  yieldToEventLoop: () => Promise<void>
): Promise<ReturnType<typeof exportVisibleStateForPlayerImpl>> {
  return exportVisibleStateForPlayerAsyncImpl({ ...ctx, playerId, yieldToEventLoop });
}

export function exportTilesInAreaForPlayerForRuntime(
  ctx: Omit<Parameters<typeof exportTilesInAreaForPlayerImpl>[0], "playerId" | "centerX" | "centerY" | "radius" | "fullVisibility">,
  playerId: string,
  centerX: number,
  centerY: number,
  radius: number,
  options?: { fullVisibility?: boolean }
): SimulationTileWireDelta[] {
  return exportTilesInAreaForPlayerImpl({
    ...ctx,
    playerId,
    centerX,
    centerY,
    radius,
    fullVisibility: options?.fullVisibility
  });
}

export function settledTilesForPlayerForRuntime(
  tiles: ReadonlyMap<string, DomainTileState>,
  summaryForPlayer: (playerId: string) => { territoryTileKeys: ReadonlySet<string> },
  playerId: string
): DomainTileState[] {
  return [...summaryForPlayer(playerId).territoryTileKeys]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile && tile.ownerId === playerId && tile.ownershipState === "SETTLED"));
}
