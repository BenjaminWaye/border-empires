import { liveReachForOwner, type LandConnectivityQuery, type ReachAnchor } from "@border-empires/shared";
import { decodeReachBorder, type ReachBorderSnapshot } from "../reach-border-snapshot/reach-border-snapshot.js";
import { seedReachBorderFromAnchors, type BorderSeedResult, type BorderSeedTileView } from "./runtime-reach-border-seed.js";

/**
 * Boot-time restore of the persistent reach border.
 *
 * The border is history-dependent (first claimant keeps an overlap while it
 * still defends it), so rebuilding it from anchor geometry alone handed
 * contested tiles to whichever player's anchors replayed first -- a restart
 * could move a player's reach onto a rival. Now the border is saved in every
 * snapshot, with later changes replayed from REACH_BORDER_CHANGED events
 * (event-recovery.ts), and this pass reconciles it with the world as loaded:
 *
 * 1. Start from the persisted border. A legacy snapshot that predates
 *    persistence has none; then every owned tile its owner's own live anchors
 *    cover is treated as that owner's reach, the best available evidence of
 *    who held it first (EXPAND/SETTLE are reach-gated, so owning the ground
 *    normally means holding its reach).
 * 2. Drop any entry whose owner no longer covers the tile with a live anchor
 *    -- exactly what the live deactivation would have done. This also drops
 *    Aether bridge reach: bridges are not persisted, so after a restart the
 *    bridge and its landing-tile reach are gone together.
 * 3. Replay every live anchor, earliest-activated first, through the normal
 *    activation path. Sticky reach means every restored tile is defended by
 *    its holder and stays put; the replay only fills unclaimed slots, picks
 *    up anchors no event recorded, and runs the rival-SETTLED contest.
 */
export type ReachBorderRestoreDeps = {
  persisted: ReachBorderSnapshot | undefined;
  tiles: ReadonlyMap<string, BorderSeedTileView>;
  gatherReachAnchors: () => ReachAnchor[];
  isLandTile?: LandConnectivityQuery;
  setReachBorder: (border: Map<string, string>) => void;
  reachBorder: () => ReadonlyMap<string, string>;
  syncReachVision: (oldBorder: ReadonlyMap<string, string>, newBorder: ReadonlyMap<string, string>, changedKeys: Iterable<string>) => void;
  applyReachAnchorActivation: (anchor: ReachAnchor, causeCommandId: string, options: { skipNeutralAutoClaim: true }) => void;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
};

export type ReachBorderRestoreResult = BorderSeedResult & {
  source: "snapshot" | "ownership";
  restored: number;
  dropped: number;
  borderSize: number;
  durationMs: number;
};

const isBarbarian = (ownerId: string): boolean => ownerId.startsWith("barbarian-");

export const restoreReachBorder = (deps: ReachBorderRestoreDeps): ReachBorderRestoreResult => {
  const startedAt = performance.now();
  const anchors = deps.gatherReachAnchors();
  const liveByOwner = new Map<string, ReadonlySet<string>>();
  const coveredByOwner = (ownerId: string, tileKey: string): boolean => {
    let live = liveByOwner.get(ownerId);
    if (!live) {
      live = liveReachForOwner(ownerId, anchors, deps.isLandTile);
      liveByOwner.set(ownerId, live);
    }
    return live.has(tileKey);
  };

  const start = new Map<string, string>();
  let dropped = 0;
  if (deps.persisted) {
    for (const [tileKey, ownerId] of decodeReachBorder(deps.persisted)) {
      if (!isBarbarian(ownerId) && coveredByOwner(ownerId, tileKey)) start.set(tileKey, ownerId);
      else dropped += 1;
    }
  } else {
    for (const [tileKey, tile] of deps.tiles) {
      const ownerId = tile.ownerId;
      if (ownerId && !isBarbarian(ownerId) && coveredByOwner(ownerId, tileKey)) start.set(tileKey, ownerId);
    }
  }
  const restored = start.size;
  deps.setReachBorder(start);
  deps.syncReachVision(new Map(), start, start.keys());

  // Stable sort: equal activatedAt keeps gatherReachAnchors' order.
  const ordered = [...anchors].sort((left, right) => left.activatedAt - right.activatedAt);
  const seed = seedReachBorderFromAnchors({
    gatherReachAnchors: () => ordered,
    applyReachAnchorActivation: deps.applyReachAnchorActivation,
    tiles: deps.tiles,
    reachBorder: deps.reachBorder,
    runtimeLogInfo: deps.runtimeLogInfo
  });
  const result: ReachBorderRestoreResult = {
    ...seed,
    source: deps.persisted ? "snapshot" : "ownership",
    restored,
    dropped,
    borderSize: deps.reachBorder().size,
    durationMs: Math.round(performance.now() - startedAt)
  };
  deps.runtimeLogInfo({ ...result }, "[reachBorderRestore] restored persistent reach border");
  return result;
};
