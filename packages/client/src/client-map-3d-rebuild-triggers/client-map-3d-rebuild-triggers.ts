import type { ClientState } from "../client-state/client-state.js";
import { activeFrontierAttackClaimTargetKeys } from "../client-map-3d-frontier-claim-plates.js";
import { serverReachKey } from "../client-reach-authoritative/client-reach-authoritative.js";
import { incursionBreachStyle } from "../client-reach-incursion/client-incursion-breach-style.js";
import {
  aetherProtectionField,
  aetherProtectionFieldKey,
  isAetherProtectionFieldShown
} from "../client-aether-tower-protection/client-aether-tower-protection.js";

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
  // Admin pocket-edge style switch (client-incursion-breach-style.ts): redraws
  // the incursion outlines as soon as it changes, without waiting for a pan.
  incursionBreachStyle: string;
  // See aetherProtectionRebuildKey.
  aetherProtectionKey: string;
};

export const EMPTY_MAP_3D_REBUILD_TRIGGERS: Map3DRebuildTriggers = { crystalTargetingActive: false, frontierAttackClaimKeys: "", reachKey: "", incursionBreachStyle: "straight", aetherProtectionKey: "" };

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


/**
 * Stable string snapshot of every FRONTIER-attack claim target currently
 * resolving: a change means a claim started or ended, so the base ownership
 * tint needs rebuilding (see activeFrontierAttackClaimTargetKeys for why the
 * tint depends on it).
 *
 * Reads the epoch clock itself rather than taking a `now` argument: the claim
 * timestamps it compares against (resolvesAt / transitEndsAt) are server epoch
 * ms, while the render loop's own `nowMs` is performance.now() (page-relative).
 * Passing that through made every claim look perpetually unresolved, so the
 * snapshot never dropped a finished claim and the claim-end rebuild never
 * fired. Keeping the clock in here leaves no caller-side clock to get wrong.
 */
export const frontierAttackClaimRebuildSnapshot = (
  state: Parameters<typeof activeFrontierAttackClaimTargetKeys>[0],
  keyFor: (x: number, y: number) => string
): string => Array.from(activeFrontierAttackClaimTargetKeys(state, keyFor, Date.now())).sort().join(",");

type AetherProtectionTriggerState = Parameters<typeof isAetherProtectionFieldShown>[0] & Parameters<typeof aetherProtectionField>[0];

/**
 * What the Aether Tower protection wash (client-map-3d-aether-protection-overlay.ts)
 * was last built from: empty while it's hidden, else every tower currently
 * shielding. Changes when the wash is toggled (tower selected, Aether tab
 * opened, ability aimed) and when a tower comes off cooldown mid-display --
 * that one has no tile delta of its own to trigger a rebuild.
 */
export const aetherProtectionRebuildKey = (state: AetherProtectionTriggerState, keyFor: (x: number, y: number) => string): string =>
  isAetherProtectionFieldShown(state, keyFor) ? `on:${aetherProtectionFieldKey(aetherProtectionField(state, Date.now()))}` : "";

export const captureMap3DRebuildTriggers = (
  state: Pick<ClientState, "crystalTargeting" | "capture" | "outgoingMusterAttacksByTile" | "tiles" | "incomingAttacksByTile" | "me" | "serverReach" | "serverReachRevision"> & AetherProtectionTriggerState,
  keyFor: (x: number, y: number) => string,
  reach3DActive: boolean
): Map3DRebuildTriggers => ({
  crystalTargetingActive: state.crystalTargeting.active,
  frontierAttackClaimKeys: frontierAttackClaimRebuildSnapshot(state, keyFor),
  reachKey: reach3DRebuildKey(reach3DActive, state),
  incursionBreachStyle: incursionBreachStyle(),
  aetherProtectionKey: aetherProtectionRebuildKey(state, keyFor)
});

export const map3DRebuildTriggersChanged = (built: Map3DRebuildTriggers, now: Map3DRebuildTriggers): boolean =>
  built.crystalTargetingActive !== now.crystalTargetingActive ||
  built.frontierAttackClaimKeys !== now.frontierAttackClaimKeys ||
  built.reachKey !== now.reachKey ||
  built.incursionBreachStyle !== now.incursionBreachStyle ||
  built.aetherProtectionKey !== now.aetherProtectionKey;
