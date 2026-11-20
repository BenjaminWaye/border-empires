// The art window's emblem for a charge with no held shape yet (owner 2026-11-19:
// "the two cards do different things but have the same imagery"). Every kind
// gets its own picture of the goal: a road between two towns, a keep, three
// towers, a charted island, dunes, ice peaks, a waking beacon, a grievance
// banner. Drawn on a 24x16 grid in the card's frame colours (.hc-art-cells),
// like the held-shape art that replaces it once a charge is fulfilled
// (client-house-charge-cards.ts).
import type { HouseChargeKind } from "@border-empires/shared";

const svg = (body: string): string =>
  `<svg class="hc-art-svg" viewBox="0 0 24 16" aria-hidden="true">${body}</svg>`;

const EMBLEMS: Readonly<Record<HouseChargeKind, string>> = {
  // Two towns joined by a road.
  CHARTER: svg(
    `<g class="hc-art-cells"><rect x="1" y="8" width="5" height="4"/><polygon points="0.5,8 3.5,5.5 6.5,8"/><rect x="18" y="8" width="5" height="4"/><polygon points="17.5,8 20.5,5.5 23.5,8"/></g>` +
      `<g class="hc-art-road"><rect x="7" y="10.2" width="2.2" height="1.1"/><rect x="10.4" y="10.2" width="2.2" height="1.1"/><rect x="13.8" y="10.2" width="2.2" height="1.1"/></g>` +
      `<rect class="hc-art-gate" x="3" y="10" width="1" height="2"/><rect class="hc-art-gate" x="20" y="10" width="1" height="2"/>`
  ),
  // A single keep with battlements: one town raised to a City.
  SEAT: svg(
    `<g class="hc-art-cells"><rect x="8" y="5" width="8" height="10"/><rect x="8" y="3" width="2" height="2"/><rect x="11" y="3" width="2" height="2"/><rect x="14" y="3" width="2" height="2"/><rect x="5" y="10" width="3" height="5"/><rect x="16" y="10" width="3" height="5"/></g>` +
      `<rect class="hc-art-gate" x="11" y="11" width="2" height="4"/><rect class="hc-art-gate" x="11.5" y="7" width="1" height="2"/>`
  ),
  // Three towers of different heights: three Metropolises on one landmass.
  METROPOLIS: svg(
    `<g class="hc-art-cells"><rect x="3" y="7" width="4" height="8"/><polygon points="3,7 5,4 7,7"/><rect x="10" y="3" width="4" height="12"/><polygon points="10,3 12,0.5 14,3"/><rect x="17" y="6" width="4" height="9"/><polygon points="17,6 19,3 21,6"/><rect x="1" y="14" width="22" height="1"/></g>` +
      `<rect class="hc-art-gate" x="4.5" y="11" width="1" height="2"/><rect class="hc-art-gate" x="11.5" y="7" width="1" height="2"/><rect class="hc-art-gate" x="11.5" y="11" width="1" height="2"/><rect class="hc-art-gate" x="18.5" y="10" width="1" height="2"/>`
  ),
  // A charted island with the House's flag.
  SURVEY: svg(
    `<g class="hc-art-cells"><polygon points="3,11 6,8 10,8.5 13,6.5 17,7.5 21,10 19,13 14,14 8,13.5 4,13"/></g>` +
      `<rect class="hc-art-gate" x="12.6" y="2" width="0.7" height="5"/><polygon class="hc-art-flag" points="13.3,2 17,3.2 13.3,4.4"/>`
  ),
  // Dunes under a high sun.
  DESERT: svg(
    `<circle class="hc-art-sun" cx="18.5" cy="4" r="2"/>` +
      `<g class="hc-art-cells"><path d="M0,14 Q5,7 11,12 Q15,9 19,11 Q22,10 24,12 L24,16 L0,16 Z"/></g>`
  ),
  // Ice peaks with snow caps.
  TUNDRA: svg(
    `<g class="hc-art-cells"><polygon points="0,15 6,5 10,10 14,3 20,11 22,9 24,12 24,15"/></g>` +
      `<g class="hc-art-snow"><polygon points="6,5 7.6,7.6 4.4,7.6"/><polygon points="14,3 16,6.2 12,6.2"/></g>`
  ),
  // A Concordance installation with its beacon awake.
  RELIC: svg(
    `<rect class="hc-art-beam" x="11.3" y="0" width="1.4" height="9"/><g class="hc-art-cells"><rect x="7" y="13" width="10" height="2"/><rect x="8.5" y="11" width="7" height="2"/><rect x="10" y="9" width="4" height="2"/></g>`
  ),
  // A grievance banner on a pole, struck through by a sword.
  CORRECTION: svg(
    `<g class="hc-art-cells"><rect x="6" y="1" width="1" height="14"/><polygon points="7,2 17,2 15,5.5 17,9 7,9"/></g>` +
      `<g class="hc-art-blade"><polygon points="20,1 21,2 10,14 9,13"/><rect x="8" y="12" width="4" height="1" transform="rotate(-48 10 12.5)"/></g>`
  )
};

/** The emblem for a charge kind with no held shape. */
export const houseChargeEmblemSvg = (kind: HouseChargeKind): string => EMBLEMS[kind];
