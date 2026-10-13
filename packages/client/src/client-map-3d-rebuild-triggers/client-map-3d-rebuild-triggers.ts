import type { ClientState } from "../client-state/client-state.js";
import { activeFrontierAttackClaimTargetKeys } from "../client-map-3d-frontier-claim-plates.js";
import { serverReachKey } from "../client-reach-authoritative/client-reach-authoritative.js";

/**
 * Non-tile state that forces client-map-3d.ts's maybeRebuild to re-run
 * rebuildVisibleTerrain even when the camera is still and no in-window tile
 * changed. maybeRebuild snapshots this on every committed rebuild and
 * rebuilds again as soon as the live value differs.
 */
export type Map3DRebuildTriggers = {
  crystalTargetingActive: boolean;
  // Forces a rebuild on claim start/end -- see activeFrontierAttackClaimTargetKeys.
  frontierAttackClaimKeys: string;
  // See reach3DRebuildKey.
  reachKey: string;
};

export const EMPTY_MAP_3D_REBUILD_TRIGGERS: Map3DRebuildTriggers = { crystalTargetingActive: false, frontierAttackClaimKeys: "", reachKey: "" };

/**
 * What the 3D reach overlay (survey-line pylons/walls, dormant-frontier and
 * rival-incursion tints) was last built from. rebuildVisibleTerrain only
 * computes reach3DCache while the true-3D renderer is active, so this must
 * change when:
 * - the renderer becomes active. The very first rebuild runs during renderer
 *   creation, before client-three-renderer-host.ts calls
 *   setTrue3DRendererActive(true), so it builds no reach at all. Without this
 *   an idle player with a still camera never saw their border.
 * - a REACH_UPDATE replaces (or a reset clears) the server reach set.
 * Deliberately excludes tilesRevision (unlike reachCacheKey): it moves on any
 * tile change anywhere on the known map, and maybeRebuild already handles
 * in-window tile changes via tileChangeIsWindowRelevant. Keying on it would
 * force a full terrain rebuild for every off-screen tile update.
 */
export const reach3DRebuildKey = (
  reach3DActive: boolean,
  state: Pick<ClientState, "serverReach" | "serverReachRevision">
): string => (reach3DActive ? `active:${serverReachKey(state)}` : "");

export const captureMap3DRebuildTriggers = (
  state: Pick<ClientState, "crystalTargeting" | "capture" | "outgoingMusterAttacksByTile" | "tiles" | "incomingAttacksByTile" | "me" | "serverReach" | "serverReachRevision">,
  keyFor: (x: number, y: number) => string,
  nowMs: number,
  reach3DActive: boolean
): Map3DRebuildTriggers => ({
  crystalTargetingActive: state.crystalTargeting.active,
  frontierAttackClaimKeys: Array.from(activeFrontierAttackClaimTargetKeys(state, keyFor, nowMs)).sort().join(","),
  reachKey: reach3DRebuildKey(reach3DActive, state)
});

export const map3DRebuildTriggersChanged = (built: Map3DRebuildTriggers, now: Map3DRebuildTriggers): boolean =>
  built.crystalTargetingActive !== now.crystalTargetingActive ||
  built.frontierAttackClaimKeys !== now.frontierAttackClaimKeys ||
  built.reachKey !== now.reachKey;
