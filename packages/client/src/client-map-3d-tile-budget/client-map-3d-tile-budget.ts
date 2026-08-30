// The 3D renderer preallocates every overlay buffer up front, sized by a
// single tile budget: ~40 InstancedMeshes at the budget's count (each
// carrying a `count * 16` instance matrix, many also a `count * 3` instance
// color), plus the ownership/fog overlays' own vertex buffers. At the old
// fixed 14000 that is on the order of 100MB of typed arrays mirrored into GPU
// buffers before a single frame is drawn — comfortable on desktop, and right
// at the edge of what Safari on a phone will hand a single tab.
//
// The budget only ever needs to cover the tiles that fit on screen at
// MIN_ZOOM (the most zoomed-out level, i.e. the most tiles visible at once).
// A phone's screen is a fraction of a desktop's, so sizing the budget to the
// actual device instead of the worst desktop case cuts the allocation
// substantially on mobile and changes nothing on desktop, where the computed
// value still exceeds the cap.
//
// Sized from `screen`, not the window: the window can be resized up to the
// screen at any time, and the buffers cannot grow after allocation. Both
// orientations are covered by pairing the long screen axis with the short
// one, so a rotation never needs more than the budget. (A window dragged onto
// a larger external display mid-session is the one uncovered case; overlays
// clamp rather than crash, and a reload re-sizes the budget.)

export type TileBudgetInput = {
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly minZoom: number;
  readonly floor: number;
  readonly cap: number;
};

// One extra tile on each side of each axis: `rebuildVisibleTerrain` floors the
// half-extent and then walks an inclusive window, so it can touch one row and
// column past the exact fit.
const EDGE_MARGIN_TILES = 2;

export const tileBudgetForScreen = ({ screenWidth, screenHeight, minZoom, floor, cap }: TileBudgetInput): number => {
  const zoom = Math.max(1, minZoom);
  const long = Math.max(screenWidth, screenHeight);
  const short = Math.min(screenWidth, screenHeight);
  if (!Number.isFinite(long) || !Number.isFinite(short) || long <= 0 || short <= 0) return cap;
  const tilesLong = Math.ceil(long / zoom) + EDGE_MARGIN_TILES;
  const tilesShort = Math.ceil(short / zoom) + EDGE_MARGIN_TILES;
  return Math.min(cap, Math.max(floor, tilesLong * tilesShort));
};

// Unchanged from the previous hardcoded value, so desktop keeps today's
// headroom exactly (every desktop screen computes well past this and clamps).
export const MAX_TILE_BUDGET = 14000;
// Generous margin over what any current phone screen needs at MIN_ZOOM
// (an iPhone 13 at 390x844 CSS px needs ~3.6k), so the reduction can never
// be the thing that clips overlays on a device we can't test on.
export const MIN_TILE_BUDGET = 6000;

// `?tilebudget=N` overrides the computed budget. This is the on-device
// bisection knob: when a phone dies during renderer construction there is no
// error to read, so the way to prove it's the allocation is to walk the
// budget down until the tab survives. Bounded well below the floor so a low
// value can actually be tried, and above the cap so it can be raised too.
const TILE_BUDGET_OVERRIDE_MIN = 200;
const TILE_BUDGET_OVERRIDE_MAX = 60000;

export const tileBudgetOverride = (search: string): number | undefined => {
  const raw = new URLSearchParams(search).get("tilebudget");
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(TILE_BUDGET_OVERRIDE_MAX, Math.max(TILE_BUDGET_OVERRIDE_MIN, parsed));
};

// `floor` is normally MIN_TILE_BUDGET, but the degradation ladder
// (client-map-3d-quality-tier.ts) passes 0 at its lowest tier so the budget
// sizes to what the screen actually shows. That is a real saving, not a
// gamble: a 390x844 phone at MIN_ZOOM needs ~3.6k tiles and the floor hands it
// 6000, so a device that has already failed twice is being asked to allocate
// 68% more instance memory than it can ever draw. The margin the floor buys is
// worth having by default and worth spending when the alternative is no 3D.
export const resolveTileBudget = (minZoom: number, floor: number = MIN_TILE_BUDGET): number => {
  if (typeof window === "undefined" || !window.screen) return MAX_TILE_BUDGET;
  const override = tileBudgetOverride(window.location?.search ?? "");
  if (override !== undefined) return override;
  return tileBudgetForScreen({
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    minZoom,
    floor,
    cap: MAX_TILE_BUDGET
  });
};

// The 2D canvas draw loop has no preallocated buffers, but it still walks
// every tile in `[-halfW, halfW] x [-halfH, halfH]` on every animation
// frame with no ceiling of its own. On a wide/ultrawide desktop screen at
// MIN_ZOOM that window can exceed 50k tiles, each running a few hundred
// lines of per-tile draw logic — that unbounded loop is what pegs the main
// thread and makes panning/zooming feel laggy. Reuse the same budget the 3D
// renderer already trusts, scaling both axes down together (not just
// truncating one) so the clamp keeps the on-screen aspect ratio instead of
// cropping one side of the viewport.
export const clampedTileHalfExtents = (
  halfW: number,
  halfH: number,
  budget: number
): { halfW: number; halfH: number } => {
  const tileCount = (2 * halfW + 1) * (2 * halfH + 1);
  if (tileCount <= budget) return { halfW, halfH };
  const scale = Math.sqrt(budget / tileCount);
  return { halfW: Math.max(1, Math.floor(halfW * scale)), halfH: Math.max(1, Math.floor(halfH * scale)) };
};
