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
//   2. allocateByProximity: if what's left still exceeds the cap, keep the
//      items closest to the camera window's center and drop the farthest
//      first -- instead of "local player's list first, rivals get
//      whatever's left" (which starved rivals entirely) or an
//      owner-blind round-robin (which could still drop something right in
//      front of the camera in favor of something at the window's edge).
//      Distance-to-center doesn't care who owns a corner, so a rival
//      right next to the camera is never starved by a distant owner --
//      and a truncated view degrades exactly the way you'd want it to:
//      the border nearest wherever the player is actually looking always
//      wins, and geometry reappears/disappears smoothly as the camera
//      pans past whatever the cap can no longer cover.

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

const distanceSq = (point: Vec2, center: Vec2, deps: WindowCullDeps): number => {
  const dx = deps.toroidDelta(center.x, point.x, deps.worldWidth);
  const dy = deps.toroidDelta(center.y, point.y, deps.worldHeight);
  return dx * dx + dy * dy;
};

/**
 * Keeps the `cap` items closest to `center` (the camera window's center),
 * dropping the farthest first -- a no-op (identity, original order) when
 * already at or under `cap`. Stable under a fixed `center`: the same items
 * always win, so this doesn't flicker frame to frame on its own; it only
 * changes as the camera actually moves.
 */
export const allocateByProximity = <T>(items: readonly T[], center: Vec2, pointOf: (item: T) => Vec2, deps: WindowCullDeps, cap: number): T[] => {
  if (items.length <= cap) return [...items];
  return [...items].sort((a, b) => distanceSq(pointOf(a), center, deps) - distanceSq(pointOf(b), center, deps)).slice(0, cap);
};

/** Combines cullPylonsToWindow + allocateByProximity -- the caller's full "raw pylons -> what actually gets a render slot this frame" pipeline in one call. `window` undefined (pre-first-rebuild) skips culling/truncation entirely. */
export const cullAndAllocatePylons = <T extends Vec2 & { ownerId: string }>(items: readonly T[], window: CullWindow | undefined, deps: WindowCullDeps, cap: number): T[] => {
  if (!window) return [...items];
  const center: Vec2 = { x: window.camX, y: window.camY };
  return allocateByProximity(cullPylonsToWindow(items, window, deps), center, (item) => item, deps, cap);
};

/** Segment counterpart of cullAndAllocatePylons -- prioritized by its nearer endpoint's distance to center. */
export const cullAndAllocateSegments = <T extends { from: Vec2; to: Vec2; ownerId: string }>(items: readonly T[], window: CullWindow | undefined, deps: WindowCullDeps, cap: number): T[] => {
  if (!window) return [...items];
  const center: Vec2 = { x: window.camX, y: window.camY };
  const culled = cullSegmentsToWindow(items, window, deps);
  return allocateByProximity(culled, center, (item) => (distanceSq(item.from, center, deps) <= distanceSq(item.to, center, deps) ? item.from : item.to), deps, cap);
};

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
