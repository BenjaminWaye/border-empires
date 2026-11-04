// Compact (phone) HUD: where to point the camera so a focused tile lands in the
// middle of the map you can still see, between the top bar and whatever covers
// the bottom (tile panel, Chronicle sheet, tab bar). Both renderers read the
// same camX/camY/zoom (zoom is pixels per tile), so shifting camY covers 2D and
// true-3D alike.

/** A selection opens the tile panel, which isn't on screen yet when the camera moves: assume at least this much of the screen is covered. */
export const COMPACT_MIN_BOTTOM_COVER = 0.4;

const BOTTOM_COVERS = ["#hud-v2-tile:not([hidden])", ".v2c-drawer", ".hud-v2-sheet", ".hud-v2-nav"];
const TOP_COVERS = [".hud-v2-top .hud-v2-bar"];

/** Rows to move the camera down so a tile at the camera's target shows centred in the visible band. */
export const compactFocusRowOffset = (input: { viewportHeight: number; topCoverPx: number; bottomCoverPx: number; zoom: number }): number => {
  if (input.zoom <= 0 || input.viewportHeight <= 0) return 0;
  const bottom = Math.max(input.bottomCoverPx, input.viewportHeight * COMPACT_MIN_BOTTOM_COVER);
  const shiftPx = (bottom - input.topCoverPx) / 2;
  return Math.max(0, Math.round(shiftPx / input.zoom));
};

const coverFromBottom = (doc: Document, viewportHeight: number): number => {
  let cover = 0;
  for (const selector of BOTTOM_COVERS) {
    doc.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) cover = Math.max(cover, viewportHeight - rect.top);
    });
  }
  return cover;
};

const coverFromTop = (doc: Document): number => {
  let cover = 0;
  for (const selector of TOP_COVERS) {
    const el = doc.querySelector<HTMLElement>(selector);
    const rect = el?.getBoundingClientRect();
    if (rect && rect.height > 0) cover = Math.max(cover, rect.bottom);
  }
  return cover;
};

/** The row offset for the live page; 0 outside the compact layout. */
export const measuredCompactFocusRowOffset = (zoom: number, doc: Document | undefined = typeof document === "undefined" ? undefined : document, viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight): number => {
  if (!doc?.body?.classList.contains("hud-v2-compact")) return 0;
  // Landscape docks the panels to the right edge (client-hud-v2-compact-screens.css), leaving the map's height free.
  if (typeof window !== "undefined" && window.innerWidth > window.innerHeight) return 0;
  return compactFocusRowOffset({ viewportHeight, topCoverPx: coverFromTop(doc), bottomCoverPx: coverFromBottom(doc, viewportHeight), zoom });
};
