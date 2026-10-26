// Map overlay toggles beside the minimap. Diplomacy is the only one for now
// (the drafts dropped Integrity and Threats); its legend shows while it's on.

import { DIPLOMACY_OVERLAY_COLORS, DIPLOMACY_OVERLAY_LABELS, DIPLOMACY_OVERLAY_STANCES } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";

export const overlaysHtml = (diplomacyOn: boolean): string => {
  const toggle = `<button type="button" class="hud-v2-overlay-btn${diplomacyOn ? " hud-v2-overlay-on" : ""}" data-hud-v2-overlay="diplomacy" aria-pressed="${diplomacyOn}" title="Diplomacy overlay">Diplomacy</button>`;
  const legend = diplomacyOn
    ? `<div class="hud-v2-overlay-legend">${DIPLOMACY_OVERLAY_STANCES.map((s) => `<span><i style="background:${DIPLOMACY_OVERLAY_COLORS[s]}"></i>${DIPLOMACY_OVERLAY_LABELS[s]}</span>`).join("")}</div>`
    : "";
  return `${legend}${toggle}`;
};
