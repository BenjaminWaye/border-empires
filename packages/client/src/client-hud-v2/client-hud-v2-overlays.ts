// Map view toggles attached to the minimap. Diplomacy is the only one for now
// (the drafts dropped Integrity and Threats): an icon tab on the minimap's
// edge, with its legend beside the minimap while it's on.

import { DIPLOMACY_OVERLAY_COLORS, DIPLOMACY_OVERLAY_LABELS, DIPLOMACY_OVERLAY_STANCES } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { navTabIconHtml } from "../client-nav-icons/client-nav-icons.js";

export const overlaysHtml = (diplomacyOn: boolean): string => {
  const label = diplomacyOn ? "Hide Diplomacy view" : "Diplomacy view";
  const toggle = `<button type="button" class="hud-v2-overlay-btn${diplomacyOn ? " hud-v2-overlay-on" : ""}" data-hud-v2-overlay="diplomacy" aria-pressed="${diplomacyOn}" aria-label="${label}" title="${label}">${navTabIconHtml("alliance")}</button>`;
  const legend = diplomacyOn
    ? `<div class="hud-v2-overlay-legend">${DIPLOMACY_OVERLAY_STANCES.map((s) => `<span><i style="background:${DIPLOMACY_OVERLAY_COLORS[s]}"></i>${DIPLOMACY_OVERLAY_LABELS[s]}</span>`).join("")}</div>`
    : "";
  return `${toggle}${legend}`;
};
