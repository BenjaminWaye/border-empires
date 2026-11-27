import type { CrestCosmeticId } from "@border-empires/shared";

// House crest charges (docs/cosmetics.md "House crests"). Steampunk icon
// style: "think emoji" -- one bold silhouette per crest on a 24-unit grid,
// strokes no thinner than 1.8 units, so each reads at 16-24 px. Every shape
// is drawn in currentColor; the emblem's field is the House colour and CSS
// outlines the whole glyph (.house-crest-glyph) so it reads on light colours.

const ring = (cx: number, cy: number, r: number, width: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${width}"/>`;

/** `count` rectangular cog teeth round (cx, cy), each `w` wide, from `inner` to `outer`. */
const teeth = (cx: number, cy: number, inner: number, outer: number, count: number, w: number): string =>
  Array.from({ length: count }, (_, i) =>
    `<rect x="${cx - w / 2}" y="${cy - outer}" width="${w}" height="${outer - inner}" rx="0.5" transform="rotate(${(360 / count) * i} ${cx} ${cy})"/>`
  ).join("");

const line = (d: string, width = 2.4): string =>
  `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const spanner = (angle: number): string =>
  `<g transform="rotate(${angle} 12 12)"><path fill-rule="evenodd" d="M8.6 5.6a3.4 3.4 0 1 0 6.8 0a3.4 3.4 0 1 0 -6.8 0z M10.9 2.2h2.2v3.6h-2.2z"/><rect x="10.8" y="8" width="2.4" height="12" rx="1.2"/><circle cx="12" cy="19.8" r="2"/></g>`;

export const CREST_GLYPHS: Record<CrestCosmeticId, string> = {
  "crest-cog": `<g>${teeth(12, 12, 5, 10.2, 8, 3.2)}</g>${ring(12, 12, 5.6, 3.6)}`,
  "crest-anchor": `${ring(12, 4.6, 2, 2)}${line("M12 6.8V20.6M8 9.4h8")}${line("M4.8 13.6c0.4 4.6 3.2 7 7.2 7s6.8-2.4 7.2-7")}<path d="M2.8 14.6l2-3.6 2.2 3.6zM17 14.6l2.2-3.6 2 3.6z"/>`,
  "crest-tower": `<path fill-rule="evenodd" d="M6.5 21V10.5H5V3.5h3v2h2.2v-2h3.6v2H16v-2h3v7h-1.5V21z M10.4 21v-3.6a1.6 1.6 0 0 1 3.2 0V21z M10.9 9.2h2.2v3h-2.2z"/>`,
  "crest-lighthouse": `<path d="M9 21.2l1.3-10.6h3.4l1.3 10.6z M9.4 6.4h5.2v3.6H9.4z M8.8 6.2L12 2.6l3.2 3.6z M6.8 20h10.4v2H6.8z"/><path d="M15.6 7.2l6-2.2v5.4z M8.4 7.2l-6-2.2v5.4z" opacity="0.85"/>`,
  "crest-airship": `<ellipse cx="12.6" cy="9" rx="8.6" ry="4.4"/><path d="M1.6 5.4l3.8 3.6-3.8 3.6z"/><rect x="9.2" y="15.2" width="6.6" height="3.2" rx="1"/>${line("M10.6 13v2.4M14.4 13v2.4", 1.8)}`,
  "crest-spanners": `${spanner(45)}${spanner(-45)}`,
  "crest-gear-wing": `<g>${teeth(8, 15, 3, 6.6, 6, 2.6)}</g>${ring(8, 15, 3.4, 2.6)}<path d="M11.2 13.6C13 7.6 17.4 4 22.4 3.4c-0.6 2.6-2 4.6-4 5.8c1.6 0 2.8 0.4 3.8 1c-1.4 1.4-3 2.2-5 2.4c1 0.6 1.8 1.4 2.2 2.4c-2.8 0.6-5.4 0.4-8.2-1.4z"/>`,
  "crest-key": `${ring(7, 7.4, 3.8, 2.8)}${line("M9.8 10.2L20.6 21", 2.8)}${line("M16.4 16.8l2.6-2.6M19 19.4l2.2-2.2", 2.4)}`,
  "crest-compass": `${ring(12, 12, 6.8, 1.8)}<path d="M12 1.6l2.4 8 8 2.4-8 2.4-2.4 8-2.4-8-8-2.4 8-2.4z"/>`,
  "crest-kraken": `<path fill-rule="evenodd" d="M5.8 12C5.8 5 18.2 5 18.2 12z M8.6 9.4a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z M13 9.4a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0z"/>${line("M7 12c-1.6 3-3.6 3.6-4.4 6.4M10 12c0 4-1.6 6.4-3.4 8.6M14 12c0 4 1.6 6.4 3.4 8.6M17 12c1.6 3 3.6 3.6 4.4 6.4", 2.2)}`,
  "crest-stag": `<path d="M9.2 10.6h5.6l-1.4 8.4L12 21.4l-1.4-2.4z M8.8 10.8l-2.6-1 1.6 2.6z M15.2 10.8l2.6-1-1.6 2.6z"/>${line("M10.4 10.4C8.6 8 6.6 6 5.6 2.4M7.6 6.6L3.6 6.2M6.4 4.4l2.4-1.8M13.6 10.4C15.4 8 17.4 6 18.4 2.4M16.4 6.6l4-0.4M17.6 4.4l-2.4-1.8", 2)}`,
  "crest-hammer": `<g transform="rotate(-40 12 12)"><rect x="4.4" y="3" width="15.2" height="6" rx="1.2"/><rect x="10.7" y="8" width="2.6" height="14" rx="1.3"/></g>`
};

/** The crest as an inline SVG, sized by its container's font size (see .house-crest-glyph). */
export const crestSvg = (id: CrestCosmeticId): string =>
  `<svg class="house-crest-glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${CREST_GLYPHS[id]}</svg>`;
