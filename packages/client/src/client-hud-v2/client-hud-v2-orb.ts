// Bottom-right manpower orb for the new HUD. The fill is the pool, in your empire colour; the line
// under the number is the next batch: its size and when it lands. Clicking opens the manpower panel.

import type { ClientState } from "../client-state/client-state.js";
import { formatRefillCountdown, freshNextBatchAmount, nextBatchGain, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";

export type OrbInput = {
  manpower: number;
  manpowerCap: number;
  nextRefillAt: number | undefined;
  /** Server-reported size of the next batch (already dropped once stale); clamped to the room left under the cap. */
  nextBatchAmount?: number | undefined;
  /** Paused (regen 0 and no batch coming) instead of a countdown to nothing. */
  regenPerMinute?: number | undefined;
  nowMs: number;
  color?: string | undefined;
};

/** Plain colour values only, since it goes into a style attribute. */
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9.,%\s]+\))$/i;

/** Relative luminance of a #rgb / #rrggbb colour, or undefined for other formats. */
const hexLuminance = (color: string): number | undefined => {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * The liquid is your empire's colour, shaded so the level shows against the dark glass and the white numbers stay
 * readable: near-black colours are lifted, pale ones darkened harder, the rest darkened a quarter. Unknown colours keep the gold.
 */
export const orbLiquidStyle = (color: string | undefined): string => {
  const c = color?.trim();
  if (!c || !SAFE_COLOR.test(c)) return "";
  const lum = hexLuminance(c);
  const mix = lum !== undefined && lum < 0.04 ? `${c} 55%, #fff` : lum !== undefined && lum > 0.4 ? `${c} 55%, #000` : `${c} 75%, #000`;
  return ` style="fill: color-mix(in srgb, ${mix})"`;
};

/** Fill fraction, clamped to 0..1 so overflow manpower never draws outside the orb. */
export const orbFill = (manpower: number, cap: number): number => (cap > 0 ? Math.max(0, Math.min(1, manpower / cap)) : 0);

/** Next batch as it lands in the pool (never more than the room left under the cap), or undefined when unknown or empty. */
export const orbBatchAmount = (input: OrbInput): number | undefined => {
  if (input.nextBatchAmount === undefined) return undefined;
  const amount = Math.floor(nextBatchGain(input.manpower, input.manpowerCap, input.nextBatchAmount));
  return amount > 0 ? amount : undefined;
};

/** Orb input from client state; the batch amount is dropped once the refill it described has passed. */
export type OrbState = Pick<
  ClientState,
  "me" | "manpower" | "manpowerCap" | "manpowerRegenPerMinute" | "nextManpowerBatchAmount" | "nextManpowerBatchAmountAt"
>;

export const orbInputForState = (state: OrbState, nowMs: number, color: string | undefined): OrbInput => ({
  manpower: state.manpower,
  manpowerCap: state.manpowerCap,
  nextRefillAt: nextManpowerRefillForPlayer(state.me, nowMs),
  nextBatchAmount: freshNextBatchAmount(state.me, state.nextManpowerBatchAmount, state.nextManpowerBatchAmountAt, nowMs),
  regenPerMinute: state.manpowerRegenPerMinute,
  nowMs,
  color
});

const orbRefillLine = (input: OrbInput): { text: string; label: string } => {
  const { nextRefillAt } = input;
  if (nextRefillAt === undefined || input.manpower >= input.manpowerCap) return { text: "", label: "" };
  const batch = orbBatchAmount(input);
  if (batch === undefined && input.regenPerMinute !== undefined && input.regenPerMinute <= 0) return { text: "paused", label: ", regen paused" };
  const eta = formatRefillCountdown(nextRefillAt - input.nowMs);
  if (batch === undefined) return { text: `next batch ${eta}`, label: `, next batch in ${eta}` };
  const amount = batch.toLocaleString("en-US");
  return { text: `+${amount} in ${eta}`, label: `, next batch +${amount} in ${eta}` };
};

export const orbHtml = (input: OrbInput): string => {
  const fill = orbFill(input.manpower, input.manpowerCap);
  const level = Math.round(170 - fill * 150);
  const line = orbRefillLine(input);
  const refill = line.text ? `<span class="hud-v2-orb-refill">${line.text}</span>` : "";
  const label = `Manpower ${Math.floor(input.manpower)} of ${Math.floor(input.manpowerCap)}${line.label}`;
  return `<button type="button" class="hud-v2-orb${fill <= 0.02 ? " hud-v2-orb-empty" : ""}" data-hud-v2-open="manpower" aria-label="${label}" title="${label}">
    <svg viewBox="0 0 180 180" aria-hidden="true">
      <defs><clipPath id="hud-v2-orb-clip"><circle cx="90" cy="90" r="74"/></clipPath></defs>
      <circle cx="90" cy="90" r="86" class="hud-v2-orb-rim"/>
      <circle cx="90" cy="90" r="74" class="hud-v2-orb-glass"/>
      <g clip-path="url(#hud-v2-orb-clip)"><path class="hud-v2-orb-liquid"${orbLiquidStyle(input.color)} d="M0 ${level} C 45 ${level - 8}, 70 ${level + 8}, 90 ${level} S 140 ${level - 8}, 180 ${level} V 180 H 0 Z"/></g>
      <circle cx="90" cy="90" r="74" class="hud-v2-orb-ring"/>
    </svg>
    <span class="hud-v2-orb-text"><span class="hud-v2-orb-label">Manpower</span><span class="hud-v2-orb-value">${Math.floor(input.manpower).toLocaleString("en-US")}</span><span class="hud-v2-orb-cap">/ ${Math.floor(input.manpowerCap).toLocaleString("en-US")}</span>${refill}</span>
  </button>`;
};
