// Keeps the guide card off what it should not cover. Playtest: the card sat on
// top of other notifications and right over the town it asked the player to
// tap. The card has two places: its usual corner (left) and the mirrored one
// on the right edge (`tg-side-end`). A few times a second it checks, in CSS
// pixels, the card against
//   - the map tiles the current step rings (projected by the active renderer,
//     2D or true-3D: client-join-experience-frame.ts passes the same
//     worldToScreen both renderers' overlays use), and
//   - notifications: the map-anchored salvage / refinery toasts, the
//     discovery-tip toast and the HUD v2 tracker and right-hand column,
// and moves to the other side when that side covers fewer of them. It only
// moves when its current side covers something, so it doesn't flip back and
// forth. While the card is docked over a panel (`tg-raised`) or minimised,
// it stays where the layout puts it.

export type GuideRect = { left: number; top: number; right: number; bottom: number };
/** Projects a world tile to CSS pixels in the viewport; undefined when it can't (no canvas yet). */
export type GuideTileProjector = (x: number, y: number) => { x: number; y: number } | undefined;

const ROOT_ID = "tutorial-guide-root";
export const GUIDE_SIDE_END_CLASS = "tg-side-end";
/** Half the size of the box kept clear around a target tile's centre, so its ring and the tap on it stay visible. */
const TARGET_CLEARANCE_PX = 28;
const SYNC_INTERVAL_MS = 200;
/** Notifications the card must not sit on. */
const NOTIFICATION_SELECTORS = [".salvage-toast-layer > *", ".refinery-toast-layer > *", "#discovery-tip-overlay", ".hud-v2-tracker", ".hud-v2-right"];

const overlaps = (a: GuideRect, b: GuideRect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const mirrored = (rect: GuideRect, viewportWidth: number): GuideRect => ({ left: viewportWidth - rect.right, right: viewportWidth - rect.left, top: rect.top, bottom: rect.bottom });

/**
 * Pure: whether the card should be on the end (right) side. `card` is where it
 * is now and `onEnd` which side that is. It moves only when its current spot
 * covers something and the mirrored spot covers less.
 */
export const guideCardOnEndSide = (card: GuideRect, onEnd: boolean, viewportWidth: number, avoid: ReadonlyArray<GuideRect>): boolean => {
  const hits = (rect: GuideRect): number => avoid.filter((other) => overlaps(rect, other)).length;
  const here = hits(card);
  if (here === 0) return onEnd;
  return hits(mirrored(card, viewportWidth)) < here ? !onEnd : onEnd;
};

/** Boxes around the projected target tiles. */
export const guideTargetRects = (tiles: ReadonlyArray<{ x: number; y: number }>, project: GuideTileProjector): GuideRect[] =>
  tiles.flatMap((tile) => {
    const point = project(tile.x, tile.y);
    return point
      ? [{ left: point.x - TARGET_CLEARANCE_PX, top: point.y - TARGET_CLEARANCE_PX, right: point.x + TARGET_CLEARANCE_PX, bottom: point.y + TARGET_CLEARANCE_PX }]
      : [];
  });

const notificationRects = (): GuideRect[] =>
  NOTIFICATION_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
    .filter((el) => !el.closest(`#${ROOT_ID}`))
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);

let lastSyncAt = -Infinity;

/** Test-only: lets the next sync run at once. */
export const resetGuidePlacementForTests = (): void => {
  lastSyncAt = -Infinity;
};

/** Called every frame; does the DOM reads at most every SYNC_INTERVAL_MS. */
export const syncGuideCardPlacement = (tiles: ReadonlyArray<{ x: number; y: number }>, project: GuideTileProjector | undefined, nowMs: number): void => {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (nowMs - lastSyncAt < SYNC_INTERVAL_MS) return;
  lastSyncAt = nowMs;
  const root = document.getElementById(ROOT_ID);
  const card = root?.querySelector<HTMLElement>(".tg-card:not([hidden])");
  if (!root || !card || root.classList.contains("tg-raised")) {
    root?.classList.remove(GUIDE_SIDE_END_CLASS);
    return;
  }
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const avoid = [...(project ? guideTargetRects(tiles, project) : []), ...notificationRects()];
  const onEnd = root.classList.contains(GUIDE_SIDE_END_CLASS);
  root.classList.toggle(GUIDE_SIDE_END_CLASS, guideCardOnEndSide(rect, onEnd, window.innerWidth, avoid));
};
