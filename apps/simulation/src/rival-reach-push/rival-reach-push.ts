export { createRivalReachPushMetrics } from "./rival-reach-push-metrics.js";
import type { RivalReachPushMetrics } from "./rival-reach-push-metrics.js";

/**
 * Server-authoritative RIVAL reach push (RIVAL_REACH_UPDATE).
 *
 * Background: the 3D map's "clashing borders" seam needs BOTH sides of the
 * contact line. The local player's own reach is already authoritative (see
 * runtime-reach-update.ts's REACH_UPDATE), but every other owner's reach is
 * still a client-side guess (client-reach-overlay-all-owners.ts) — a plain
 * union of anchor-radius disks with no clipping against anyone else's
 * border. Because that guess isn't clipped, two owners' boundary loops
 * rarely land on the exact shared line the seam detector needs: they either
 * don't touch (no seam renders) or overlap (the two borders visually cross).
 *
 * The server already has the answer: `Runtime.reachBorder` is the single
 * contested/clipped border for every owner, not just the caller. This module
 * only handles DELIVERY of that existing data, clipped per-viewer to
 * fog-of-war (never leak a rival's border shape into unscouted ground) and
 * fanned out only on real change (never per-tick).
 *
 * Deliberately lives at the SERVICE layer (simulation-service.ts), not
 * inside Runtime: Runtime has no notion of who is currently connected —
 * that's `subscriptionRegistry`, owned by the service. Runtime exposes only
 * narrow, read-only accessors (reachBorderTileKeysGroupedByOwner,
 * reachTileKeysForPlayer, isTileVisibleToPlayer, emitRivalReachUpdate,
 * takeReachChangedTileKeys) and never sees the subscription registry itself.
 *
 * Two triggers, mirroring the existing self-reach push's two triggers:
 *
 * 1. MUTATION (`pushRivalReachOnOwnerChanged`): fired once per REACH_UPDATE
 *    player-message event observed on the sim event stream (i.e. exactly
 *    when `flushReachUpdates` already decided owner O's own reach changed).
 *    Cost is bounded by the SMALL set of tiles that actually changed for O
 *    this mutation (`takeReachChangedTileKeys`, sourced from
 *    `settleOvertaken`'s already-computed `overtaken` list plus the
 *    unclaimed-grant case — see runtime-reach-border-apply.ts), not by O's
 *    total border size: for each connected viewer, a handful of O(1)
 *    isVisible checks against those few tiles decides whether that viewer
 *    needs anything at all. Only once a viewer clears that cheap gate do we
 *    pay for the full per-tile clip of O's current border.
 *
 * 2. CONNECT (`pushRivalReachOnConnectSafely`): fired from the same safe
 *    point in the gateway connect sequence as `live-subscribe-reach-push.ts`
 *    (`trigger: "gateway_live_subscribe"`) — see that file's doc comment for
 *    why anything earlier gets silently dropped. Without this, a freshly
 *    connected player has zero rival reach and falls back to the client
 *    guess indefinitely, since the mutation trigger only fires on the NEXT
 *    change. This is the one genuinely non-trivial cost point: no small
 *    "changed" set exists yet, so it scans each visible-owner border against
 *    the joining viewer directly. Bounded by MAX_CONNECT_TILE_SCAN and
 *    measured (see metrics) since login is a known-sensitive path here.
 *
 *    The budget is charged only against owners with at least one tile
 *    currently visible to the joining viewer (`hasAnyVisibleTile` gates the
 *    cap check, not just the later clip). Owners with zero visible overlap
 *    are free to scan past. Without this ordering, a large season with many
 *    owners the viewer can't even see could exhaust MAX_CONNECT_TILE_SCAN
 *    before the scan ever reaches a genuinely adjacent, visible rival —
 *    permanently starving that rival's authoritative push for this viewer on
 *    every future connect (no other trigger fires for an inactive/offline
 *    owner), leaving the client's unclipped local guess in place forever and
 *    producing the exact crossing-border rendering bug this whole module
 *    exists to prevent.
 *
 * Both triggers isolate failures the same way the self-reach push does: a
 * dropped rival push degrades to the client's local guess, which is
 * survivable, whereas failing the surrounding RPC is not.
 */

/** Upper bound on tiles actually clipped and pushed across all rival owners for one connect-time push, so a large season with many active empires can't turn login into an unbounded payload. */
const MAX_CONNECT_TILE_SCAN = 8_000;

/**
 * Upper bound on tiles examined by the visibility gate across ALL owners for
 * one connect-time push — separate from, and larger than, MAX_CONNECT_TILE_SCAN.
 * Proving an owner has zero visible overlap costs O(that owner's tile count):
 * `hasAnyVisibleTile` can't short-circuit when nothing is visible. Each check
 * is a cheap O(1) incrementally-maintained fog lookup (isTileVisibleToPlayer),
 * so this budget can be far more generous than the payload cap while still
 * keeping a hard ceiling on login-time work — without one, a season with many
 * large, fully-invisible-to-viewer owners would make the gate itself
 * unbounded, reintroducing the exact problem MAX_CONNECT_TILE_SCAN exists to
 * prevent, just moved from "charging the push budget" to "probing visibility".
 */
const MAX_CONNECT_VISIBILITY_PROBE_SCAN = 10 * MAX_CONNECT_TILE_SCAN;

export type RivalReachPushRuntimeDeps = {
  /**
   * Every owner's current border tile keys, grouped in ONE pass over the
   * global border (see runtime-reach-anchors.ts's reachTileKeysGroupedByOwner
   * — calling a per-owner filter once per owner here would be O(owners x
   * global border size); this is the connect push's only full-border read.
   */
  reachBorderTileKeysGroupedByOwner: () => ReadonlyMap<string, string[]>;
  /** Authoritative reach tile keys for one owner (any owner id, not just the caller) — cheap here because the mutation trigger only ever needs exactly one owner. */
  reachTileKeysForPlayer: (ownerId: string) => string[];
  /** O(1), incrementally-maintained fog-of-war check — see tile-delta-visibility-filter.ts's VisibilityCoverageReader. */
  isTileVisibleToPlayer: (viewerId: string, tileKey: string) => boolean;
  /** Drains the small buffer of tiles that changed hands for `ownerId` since the last drain. */
  takeReachChangedTileKeys: (ownerId: string) => string[];
  /** Emits a RIVAL_REACH_UPDATE player message addressed to one viewer. */
  emitRivalReachUpdate: (viewerId: string, ownerId: string, tileKeys: string[], revision: number, causeCommandId: string) => void;
};

export type RivalReachPushRegistryDeps = {
  /** Every currently (live-)subscribed player id, same source the tile-delta fanout already uses. */
  subscribedPlayerIds: () => string[];
};

export type RivalReachPushDeps = RivalReachPushRuntimeDeps &
  RivalReachPushRegistryDeps & {
    metrics: RivalReachPushMetrics;
    now: () => number;
  };

export type RivalReachPushLog = {
  error: (payload: Record<string, unknown>, message: string) => void;
};

/**
 * Per-(viewer, owner) emission bookkeeping. Bounded by (connected players) ×
 * (owners they've ever been pushed for), which tracks the same bound the
 * existing per-player reach state already accepts — see
 * docs/agents/state-and-persistence-discipline.md.
 */
export type RivalReachPushState = {
  readonly revisionByViewerOwner: Map<string, number>;
  readonly lastEmittedSignatureByViewerOwner: Map<string, string>;
};

export const createRivalReachPushState = (): RivalReachPushState => ({
  revisionByViewerOwner: new Map<string, number>(),
  lastEmittedSignatureByViewerOwner: new Map<string, string>()
});

const viewerOwnerKey = (viewerId: string, ownerId: string): string => `${viewerId}|${ownerId}`;

/** True as soon as any one of `tileKeys` is visible to `viewerId` — short-circuits on the first hit, so the common "not near me" case costs at most a handful of O(1) checks. */
const hasAnyVisibleTile = (deps: RivalReachPushRuntimeDeps, viewerId: string, tileKeys: readonly string[]): boolean => {
  for (const tileKey of tileKeys) {
    if (deps.isTileVisibleToPlayer(viewerId, tileKey)) return true;
  }
  return false;
};

/** Clips `tileKeys` (an owner's full current border) down to what `viewerId` can currently see — never sends a tile the viewer has no vision on. */
const clipToVisibility = (deps: RivalReachPushRuntimeDeps, viewerId: string, tileKeys: readonly string[]): string[] => {
  const clipped: string[] = [];
  for (const tileKey of tileKeys) {
    if (deps.isTileVisibleToPlayer(viewerId, tileKey)) clipped.push(tileKey);
  }
  return clipped;
};

/** Emits (or dedup-skips) one clipped RIVAL_REACH_UPDATE for one (viewer, owner) pair. Shared tail for both triggers. */
const emitClippedIfChanged = (
  state: RivalReachPushState,
  deps: RivalReachPushDeps,
  viewerId: string,
  ownerId: string,
  clippedTileKeys: string[],
  causeCommandId: string
): boolean => {
  const key = viewerOwnerKey(viewerId, ownerId);
  const signature = [...clippedTileKeys].sort().join("|");
  if (state.lastEmittedSignatureByViewerOwner.get(key) === signature) {
    deps.metrics.incrementPushDedupSkipped();
    return false;
  }
  const revision = (state.revisionByViewerOwner.get(key) ?? 0) + 1;
  state.revisionByViewerOwner.set(key, revision);
  state.lastEmittedSignatureByViewerOwner.set(key, signature);
  deps.emitRivalReachUpdate(viewerId, ownerId, clippedTileKeys, revision, causeCommandId);
  return true;
};

/**
 * MUTATION trigger. Called once per REACH_UPDATE event observed for
 * `ownerId` (i.e. `ownerId`'s own reach just changed). Drains the small
 * changed-tile buffer for that owner and, for every OTHER connected viewer,
 * decides visibility off that small set before paying for a full clip.
 */
export const pushRivalReachOnOwnerChanged = (
  state: RivalReachPushState,
  deps: RivalReachPushDeps,
  ownerId: string,
  causeCommandId: string,
  log: RivalReachPushLog
): void => {
  try {
    const changedTileKeys = deps.takeReachChangedTileKeys(ownerId);
    if (changedTileKeys.length === 0) return; // nothing new recorded — e.g. a duplicate/no-op flush
    let fullOwnerTileKeys: string[] | undefined;
    for (const viewerId of deps.subscribedPlayerIds()) {
      if (viewerId === ownerId) continue;
      if (!hasAnyVisibleTile(deps, viewerId, changedTileKeys)) {
        deps.metrics.incrementMutationPushNoVisibleOverlap();
        continue;
      }
      fullOwnerTileKeys ??= deps.reachTileKeysForPlayer(ownerId);
      const clipped = clipToVisibility(deps, viewerId, fullOwnerTileKeys);
      if (emitClippedIfChanged(state, deps, viewerId, ownerId, clipped, causeCommandId)) {
        deps.metrics.incrementMutationPushEmitted();
      }
    }
  } catch (error) {
    deps.metrics.incrementMutationPushFailed();
    log.error({ err: error, ownerId }, "rival reach mutation push failed");
  }
};

/**
 * CONNECT trigger. Called once at the same safe point in the connect
 * sequence as live-subscribe-reach-push.ts. No "changed" set exists yet, so
 * this scans each other owner's border directly against the joining
 * viewer's visibility. A failure here degrades to the client's local guess
 * and must never reject the surrounding subscribe RPC — same isolation
 * contract as the self-reach connect push.
 *
 * Two SEPARATE budgets, so neither can starve the other's purpose:
 * - `tilesProbed`, capped by MAX_CONNECT_VISIBILITY_PROBE_SCAN, bounds total
 *   tiles examined by the visibility gate across EVERY owner, visible or
 *   not. Proving an owner has zero visible overlap costs O(that owner's tile
 *   count) — `hasAnyVisibleTile` can't short-circuit when nothing is visible
 *   — so without its own bound, a season with many large, fully-invisible-
 *   to-viewer owners would make this scan unbounded, reintroducing the exact
 *   cost problem the connect-time cap exists to prevent. An owner whose
 *   probe gets truncated by this budget is treated the same as "capped"
 *   (unproven either way), never as "no visible overlap" — a visible tile
 *   could be sitting just past the truncated window.
 * - `tilesScanned`, capped by MAX_CONNECT_TILE_SCAN, bounds total tiles
 *   actually clipped and pushed (the wire payload), charged only once an
 *   owner has cleared the separately-bounded visibility gate above. Gating
 *   on visibility BEFORE charging this budget is deliberate: an owner with
 *   zero tiles visible to this viewer must never eat into it, or enough
 *   invisible owners ahead of a genuinely visible rival in iteration order
 *   can cap that rival's authoritative push out — permanently, for an
 *   inactive/offline rival, since no other trigger ever retries for them.
 */
export const pushRivalReachOnConnectSafely = (state: RivalReachPushState, deps: RivalReachPushDeps, viewerId: string, log: RivalReachPushLog): void => {
  const startedAt = deps.now();
  let tilesProbed = 0;
  let tilesScanned = 0;
  try {
    for (const [ownerId, fullOwnerTileKeys] of deps.reachBorderTileKeysGroupedByOwner()) {
      if (ownerId === viewerId) continue;
      deps.metrics.incrementConnectPushOwnersScanned();
      // Cheap visibility gate BEFORE charging the push budget: an owner with
      // zero tiles visible to this viewer must never eat into
      // MAX_CONNECT_TILE_SCAN's push budget, or enough invisible owners ahead
      // of a genuinely visible rival in iteration order can cap that rival
      // out — see this function's doc comment. The gate itself is bounded by
      // the separate tilesProbed budget below.
      if (tilesProbed >= MAX_CONNECT_VISIBILITY_PROBE_SCAN) {
        deps.metrics.incrementConnectPushTileScanCapped();
        continue;
      }
      const remainingProbeBudget = MAX_CONNECT_VISIBILITY_PROBE_SCAN - tilesProbed;
      const probedTileKeys = fullOwnerTileKeys.length <= remainingProbeBudget ? fullOwnerTileKeys : fullOwnerTileKeys.slice(0, remainingProbeBudget);
      tilesProbed += probedTileKeys.length;
      if (!hasAnyVisibleTile(deps, viewerId, probedTileKeys)) {
        if (probedTileKeys.length < fullOwnerTileKeys.length) {
          deps.metrics.incrementConnectPushTileScanCapped(); // truncated probe — not proven invisible, just unresolved
        } else {
          deps.metrics.incrementConnectPushNoVisibleOverlap();
        }
        continue;
      }
      if (tilesScanned + fullOwnerTileKeys.length > MAX_CONNECT_TILE_SCAN) {
        deps.metrics.incrementConnectPushTileScanCapped();
        continue; // skip this owner this pass rather than truncate mid-border; the next mutation push (or a future connect) will catch up
      }
      tilesScanned += fullOwnerTileKeys.length;
      const clipped = clipToVisibility(deps, viewerId, fullOwnerTileKeys);
      if (clipped.length === 0) continue; // nothing of this owner's border is visible to the joining viewer
      if (emitClippedIfChanged(state, deps, viewerId, ownerId, clipped, `rival-reach-connect:${startedAt}`)) {
        deps.metrics.incrementConnectPushEmitted();
      }
    }
  } catch (error) {
    deps.metrics.incrementConnectPushFailed();
    log.error({ err: error, viewerId }, "rival reach connect push failed");
  } finally {
    deps.metrics.addConnectPushWallTimeMs(deps.now() - startedAt);
  }
};
