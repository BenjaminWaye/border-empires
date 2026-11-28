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
//
// On phones the right edge holds the Victory Race column (`.hud-v2-right`), and
// the mirrored spot started at the same height as the left one, so the card or
// its "?" sat on that card (playtest 2026-11-28). There the end spot drops below
// the column: `--tg-end-drop` (a margin-top, client-hud-v2-compact.css).

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

/** The other spot. `endDrop` is how much lower the end spot sits than the start one. */
const mirrored = (rect: GuideRect, viewportWidth: number, onEnd: boolean, endDrop: number): GuideRect => {
  const dy = onEnd ? -endDrop : endDrop;
  return { left: viewportWidth - rect.right, right: viewportWidth - rect.left, top: rect.top + dy, bottom: rect.bottom + dy };
};

/**
 * Pure: whether the card should be on the end (right) side. `card` is where it
 * is now and `onEnd` which side that is. It moves only when its current spot
 * covers something and the mirrored spot covers less.
 */
export const guideCardOnEndSide = (card: GuideRect, onEnd: boolean, viewportWidth: number, avoid: ReadonlyArray<GuideRect>, endDrop = 0): boolean => {
  const hits = (rect: GuideRect): number => avoid.filter((other) => overlaps(rect, other)).length;
  const here = hits(card);
  if (here === 0) return onEnd;
  return hits(mirrored(card, viewportWidth, onEnd, endDrop)) < here ? !onEnd : onEnd;
};

/** Gap kept between the bottom of the right-hand column and the guide on the end side. */
const END_COLUMN_GAP_PX = 8;

/**
 * Pure: how far the end spot must drop so it starts below the right-hand column.
 * `startTop` is the top of the usual (undropped) spot; no column, no drop.
 */
export const guideEndSideDrop = (startTop: number, rightColumn: GuideRect | undefined): number =>
  rightColumn ? Math.max(0, Math.ceil(rightColumn.bottom + END_COLUMN_GAP_PX - startTop)) : 0;

const END_DROP_VAR = "--tg-end-drop";

/** Phones only: measures the right-hand column and sets the end spot's drop. Returns it. */
const syncEndSideDrop = (root: HTMLElement): number => {
  if (!document.body.classList.contains("hud-v2-compact")) {
    root.style.removeProperty(END_DROP_VAR);
    return 0;
  }
  const current = root.classList.contains(GUIDE_SIDE_END_CLASS) ? parseFloat(root.style.getPropertyValue(END_DROP_VAR)) || 0 : 0;
  const startTop = root.getBoundingClientRect().top - current;
  const column = document.querySelector<HTMLElement>(".hud-v2-right")?.getBoundingClientRect();
  const drop = guideEndSideDrop(startTop, column && column.width > 0 && column.height > 0 ? column : undefined);
  root.style.setProperty(END_DROP_VAR, `${drop}px`);
  return drop;
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
  // Measured before the card checks: during a drone flight only the "?" shows and it keeps the end spot.
  const endDrop = root ? syncEndSideDrop(root) : 0;
  const card = root?.querySelector<HTMLElement>(".tg-card:not([hidden])");
  if (!root || !card || root.classList.contains("tg-raised")) {
    root?.classList.remove(GUIDE_SIDE_END_CLASS);
    return;
  }
  const rect = card.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const avoid = [...(project ? guideTargetRects(tiles, project) : []), ...notificationRects()];
  const onEnd = root.classList.contains(GUIDE_SIDE_END_CLASS);
  root.classList.toggle(GUIDE_SIDE_END_CLASS, guideCardOnEndSide(rect, onEnd, window.innerWidth, avoid, endDrop));
};
