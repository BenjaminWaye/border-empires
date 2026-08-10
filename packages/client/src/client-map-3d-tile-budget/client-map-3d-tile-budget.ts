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

export const resolveTileBudget = (minZoom: number): number => {
  if (typeof window === "undefined" || !window.screen) return MAX_TILE_BUDGET;
  return tileBudgetForScreen({
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    minZoom,
    floor: MIN_TILE_BUDGET,
    cap: MAX_TILE_BUDGET
  });
};
