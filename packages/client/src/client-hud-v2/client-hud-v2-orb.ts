// Bottom-right manpower orb for the new HUD. The fill is the pool; the line
// under the number is the next refill. Clicking opens the manpower panel.

import { formatRefillCountdown } from "../client-manpower-gauge/client-manpower-refill.js";

export type OrbInput = { manpower: number; manpowerCap: number; nextRefillAt: number | undefined; nowMs: number };

/** Fill fraction, clamped to 0..1 so overflow manpower never draws outside the orb. */
export const orbFill = (manpower: number, cap: number): number => (cap > 0 ? Math.max(0, Math.min(1, manpower / cap)) : 0);

export const orbHtml = (input: OrbInput): string => {
  const fill = orbFill(input.manpower, input.manpowerCap);
  const level = Math.round(170 - fill * 150);
  const refill = input.nextRefillAt !== undefined && input.manpower < input.manpowerCap
    ? `<span class="hud-v2-orb-refill">refill ${formatRefillCountdown(input.nextRefillAt - input.nowMs)}</span>`
    : "";
  const label = `Manpower ${Math.floor(input.manpower)} of ${Math.floor(input.manpowerCap)}`;
  return `<button type="button" class="hud-v2-orb${fill <= 0.02 ? " hud-v2-orb-empty" : ""}" data-hud-v2-open="manpower" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <defs><clipPath id="hud-v2-orb-clip"><circle cx="90" cy="90" r="74"/></clipPath></defs>
      <circle cx="90" cy="90" r="86" class="hud-v2-orb-rim"/>
      <circle cx="90" cy="90" r="74" class="hud-v2-orb-glass"/>
      <g clip-path="url(#hud-v2-orb-clip)"><path class="hud-v2-orb-liquid" d="M0 ${level} C 45 ${level - 8}, 70 ${level + 8}, 90 ${level} S 140 ${level - 8}, 180 ${level} V 180 H 0 Z"/></g>
      <circle cx="90" cy="90" r="74" class="hud-v2-orb-ring"/>
    </svg>
    <span class="hud-v2-orb-text"><span class="hud-v2-orb-label">Manpower</span><span class="hud-v2-orb-value">${Math.floor(input.manpower).toLocaleString("en-US")}</span><span class="hud-v2-orb-cap">/ ${Math.floor(input.manpowerCap).toLocaleString("en-US")}</span>${refill}</span>
  </button>`;
};
