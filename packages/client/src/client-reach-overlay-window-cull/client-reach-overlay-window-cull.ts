// Pure helpers that keep the 3D Aether Survey Line overlay within its fixed
// pylon/segment pool (client-map-3d-aether-survey-line.ts's
// MAX_PYLONS_HARD_CAP/MAX_SEGMENTS_HARD_CAP) without either (a) silently
// truncating in list order -- which starved rivals entirely and rendered
// only whichever of the local player's islands happened to trace first --
// or (b) rendering border geometry for islands nowhere near the camera,
// which is wasted cost the on-screen pool budget can't afford to spend.
//
// Two-stage fix:
//   1. cullToWindow: drop anything outside the current terrain window (+
//      margin) before it ever competes for a pool slot. A modest empire's
//      total corner count already exceeds the pool (see the file header
//      comment on the hard caps for the measured numbers); the vast
//      majority of that count is always off-screen at any one time.
//   2. allocateFairly: if what's left still exceeds the cap, round-robin
//      across owners (grouped, order-preserved within each owner) instead
//      of "local player's list first, rivals get whatever's left" -- the
//      previous behavior, which meant a rival's border NEVER rendered
//      whenever the local player's own pylons alone reached the cap.

export type Vec2 = { readonly x: number; readonly y: number };

export type CullWindow = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
};

export type WindowCullDeps = {
  readonly toroidDelta: (from: number, to: number, dim: number) => number;
  readonly worldWidth: number;
  readonly worldHeight: number;
};

/** Extra tiles beyond the rebuilt terrain window's own half-extents that a pylon/segment endpoint may still fall in and be kept -- avoids culling geometry right at the window edge that's still on-screen (or about to be, mid-pan). */
export const CULL_WINDOW_MARGIN_TILES = 4;

const withinWindow = (point: Vec2, window: CullWindow, margin: number, deps: WindowCullDeps): boolean => {
  const dx = deps.toroidDelta(window.camX, point.x, deps.worldWidth);
  const dy = deps.toroidDelta(window.camY, point.y, deps.worldHeight);
  return Math.abs(dx) <= window.halfW + margin && Math.abs(dy) <= window.halfH + margin;
};

/** Keeps a pylon only if its single corner point is within the window. */
export const cullPylonsToWindow = <T extends Vec2>(items: readonly T[], window: CullWindow, deps: WindowCullDeps, margin: number = CULL_WINDOW_MARGIN_TILES): T[] =>
  items.filter((item) => withinWindow(item, window, margin, deps));

/** Keeps a segment if EITHER endpoint is within the window (mirrors isReachOverlayCornerVisible's segment rule -- a chord crossing the window edge should still draw). */
export const cullSegmentsToWindow = <T extends { from: Vec2; to: Vec2 }>(items: readonly T[], window: CullWindow, deps: WindowCullDeps, margin: number = CULL_WINDOW_MARGIN_TILES): T[] =>
  items.filter((item) => withinWindow(item.from, window, margin, deps) || withinWindow(item.to, window, margin, deps));

/**
 * Round-robins `items` (already culled) across their distinct `ownerId`s so
 * no single owner's items can exhaust the whole `cap` and starve every
 * other owner -- picks one item from each owner in turn, cycling owner
 * order, until either `cap` is reached or every owner is exhausted. Order
 * within each owner's own items is preserved (so e.g. mandatory boundary
 * corners sampled first by samplePerimeterPylons still win out over that
 * same owner's later, less essential ones).
 *
 * A no-op (identity, single pass through in original order) when the input
 * is already at or under `cap` -- this only reshuffles when truncation is
 * actually about to happen.
 */
/** Combines cullPylonsToWindow + allocateFairlyByOwner -- the caller's full "raw pylons -> what actually gets a render slot this frame" pipeline in one call. `window` undefined (pre-first-rebuild) skips culling entirely. */
export const cullAndAllocatePylons = <T extends Vec2 & { ownerId: string }>(items: readonly T[], window: CullWindow | undefined, deps: WindowCullDeps, cap: number): T[] =>
  allocateFairlyByOwner(window ? cullPylonsToWindow(items, window, deps) : items, cap);

/** Segment counterpart of cullAndAllocatePylons. */
export const cullAndAllocateSegments = <T extends { from: Vec2; to: Vec2; ownerId: string }>(items: readonly T[], window: CullWindow | undefined, deps: WindowCullDeps, cap: number): T[] =>
  allocateFairlyByOwner(window ? cullSegmentsToWindow(items, window, deps) : items, cap);

type OwnedPylon = Vec2 & { ownerId: string };
type OwnedSegment = { from: Vec2; to: Vec2; ownerId: string };

/** Final dedup pass, keyed by owner+position, dropping anything whose corner isn't currently visible (fog-of-war) -- the last step before diffTransitions. */
export const buildCurrentPylonMap = <T extends OwnedPylon>(items: readonly T[], isCornerVisible: (x: number, y: number) => boolean): Map<string, T> => {
  const out = new Map<string, T>();
  for (const point of items) {
    if (isCornerVisible(point.x, point.y)) out.set(`${point.ownerId}:${point.x},${point.y}`, point);
  }
  return out;
};

/** Segment counterpart of buildCurrentPylonMap -- kept if EITHER endpoint is currently visible, matching the corner-visibility rule a chord that crosses the fog boundary should still draw. */
export const buildCurrentSegmentMap = <T extends OwnedSegment>(items: readonly T[], isCornerVisible: (x: number, y: number) => boolean): Map<string, { fx: number; fy: number; tx: number; ty: number; ownerId: string }> => {
  const out = new Map<string, { fx: number; fy: number; tx: number; ty: number; ownerId: string }>();
  for (const segment of items) {
    if (!isCornerVisible(segment.from.x, segment.from.y) && !isCornerVisible(segment.to.x, segment.to.y)) continue;
    out.set(`${segment.ownerId}:${segment.from.x},${segment.from.y}|${segment.to.x},${segment.to.y}`, {
      fx: segment.from.x, fy: segment.from.y, tx: segment.to.x, ty: segment.to.y, ownerId: segment.ownerId
    });
  }
  return out;
};

export const allocateFairlyByOwner = <T extends { ownerId: string }>(items: readonly T[], cap: number): T[] => {
  if (items.length <= cap) return [...items];
  const byOwner = new Map<string, T[]>();
  const ownerOrder: string[] = [];
  for (const item of items) {
    let bucket = byOwner.get(item.ownerId);
    if (!bucket) {
      bucket = [];
      byOwner.set(item.ownerId, bucket);
      ownerOrder.push(item.ownerId);
    }
    bucket.push(item);
  }
  const cursors = new Map<string, number>(ownerOrder.map((id) => [id, 0]));
  const out: T[] = [];
  let remaining = ownerOrder.length;
  while (out.length < cap && remaining > 0) {
    remaining = 0;
    for (const ownerId of ownerOrder) {
      if (out.length >= cap) break;
      const bucket = byOwner.get(ownerId)!;
      const cursor = cursors.get(ownerId)!;
      if (cursor >= bucket.length) continue;
      out.push(bucket[cursor]!);
      cursors.set(ownerId, cursor + 1);
      if (cursor + 1 < bucket.length) remaining += 1;
    }
  }
  return out;
};
