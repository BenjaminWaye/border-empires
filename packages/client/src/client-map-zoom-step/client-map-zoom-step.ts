// Wheel zoom stepping.
//
// `zoom` is pixels-per-tile over MIN_ZOOM..MAX_ZOOM (10..192). The wheel
// handler used to add a flat ±1 per event, which makes the gesture feel
// broken at both ends of the range: at zoom 192 a notch is a 0.5% change
// (invisible), and crossing the full range takes ~180 notches. A geometric
// step moves a constant *fraction* of the current zoom instead, so a notch
// looks the same everywhere and the range crosses in ~15-20 notches.
//
// deltaY magnitude is honoured too. A trackpad emits many small-delta events
// per gesture and a wheel mouse emits few large ones; ignoring magnitude (as
// the old handler did) makes one of the two feel wrong no matter which notch
// size is picked.

export type ZoomStepInput = {
  readonly zoom: number;
  readonly deltaY: number;
  readonly deltaMode: number;
  readonly minZoom: number;
  readonly maxZoom: number;
};

// Zoom multiplier for one standard wheel notch. 1.15 crosses 10..192 in
// ~21 notches: log(192/10) / log(1.15) ≈ 21.
const ZOOM_FACTOR_PER_NOTCH = 1.15;

// WheelEvent.deltaMode units → pixels. A "line" is ~16px and a "page" is
// roughly a viewport; both are approximations, which is fine because the
// result is clamped to NOTCH_CLAMP below anyway.
const PIXELS_PER_LINE = 16;
const PIXELS_PER_PAGE = 400;

// Pixels of deltaY that count as one notch. Chrome reports 100 for a mouse
// wheel click; trackpads report much smaller values, which become fractional
// notches.
const PIXELS_PER_NOTCH = 100;

// A single event never moves more than this many notches. Some mice and
// "smooth scrolling" drivers emit one enormous delta that would otherwise
// jump the whole range in one event.
const NOTCH_CLAMP = 4;

// Exported so callers that accumulate deltaY across multiple events (e.g. to
// coalesce several wheel events into one state update per frame) can convert
// each event to pixels as it arrives, rather than accumulating raw values
// that mix units if deltaMode ever changes mid-accumulation.
export const deltaYInPixels = (deltaY: number, deltaMode: number): number => {
  if (deltaMode === 1) return deltaY * PIXELS_PER_LINE;
  if (deltaMode === 2) return deltaY * PIXELS_PER_PAGE;
  return deltaY;
};

// Returns the zoom level after one wheel event. Positive deltaY (scroll down /
// pull toward you) zooms out, matching the old handler and every map UI.
export const zoomStepFor = ({ zoom, deltaY, deltaMode, minZoom, maxZoom }: ZoomStepInput): number => {
  const clampToRange = (value: number): number => Math.min(maxZoom, Math.max(minZoom, value));
  const current = clampToRange(zoom);
  if (!Number.isFinite(deltaY) || deltaY === 0) return current;

  const pixels = deltaYInPixels(deltaY, deltaMode);
  const rawNotches = pixels / PIXELS_PER_NOTCH;
  const notches = Math.min(NOTCH_CLAMP, Math.max(-NOTCH_CLAMP, rawNotches));
  const zoomingOut = notches > 0;

  const scaled = current * ZOOM_FACTOR_PER_NOTCH ** -notches;
  const rounded = Math.round(scaled);

  // Below ~7px/tile the geometric step rounds back onto the current level and
  // the gesture stalls. Force at least one level of travel in the intended
  // direction so every event does something.
  const stepped = rounded === current ? current + (zoomingOut ? -1 : 1) : rounded;
  return clampToRange(stepped);
};
