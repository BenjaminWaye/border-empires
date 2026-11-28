import {
  EMPIRE_COLOR_PALETTE,
  freeEmpireColors,
  hueWheelCandidates,
  isEmpireColorFarEnough,
  nearestFreeEmpireColor
} from "@border-empires/shared";
import { activeEmpiresOf, colorsInUseOf } from "./taken-color-set.js";

// -- palette ------------------------------------------------------------------

// The palette now lives in @border-empires/shared (empire-color-palette.ts) so
// the client offers and suggests from the same candidates.
export const BASE_PALETTE: readonly string[] = EMPIRE_COLOR_PALETTE;

// -- reserved colours ---------------------------------------------------------

export const RESERVED_COLORS = new Set(["#2f3842"]); // barbarian grey

// -- normalise -----------------------------------------------------------------

/**
 * Trim + lowercase.  Accepts #rrggbb (stable) and #rgb (expanded).
 * Returns null for anything else.
 */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return null;
}

// -- colour distance -----------------------------------------------------------

export function colorDistance(a: string, b: string): number {
  const ra = parseInt(a.slice(1, 3), 16);
  const ga = parseInt(a.slice(3, 5), 16);
  const ba = parseInt(a.slice(5, 7), 16);
  const rb = parseInt(b.slice(1, 3), 16);
  const gb = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  return Math.sqrt((ra - rb) ** 2 + (ga - gb) ** 2 + (ba - bb) ** 2);
}

// -- taken helpers -------------------------------------------------------------

export function isTaken(hex: string, taken: ReadonlySet<string>): boolean {
  return taken.has(hex) || RESERVED_COLORS.has(hex);
}

/**
 * Free to hand out: not held exactly by anyone, and (when `taken` is a
 * TakenColorSet) at least MIN_EMPIRE_COLOR_DELTA_E from every active empire.
 */
export function isColorAvailable(hex: string, taken: ReadonlySet<string>): boolean {
  if (isTaken(hex, taken)) return false;
  return isEmpireColorFarEnough(hex, activeEmpiresOf(taken).map((empire) => empire.color));
}

// -- suggest alternative --------------------------------------------------------

/**
 * The free colour nearest to `desired` (shared nearestFreeEmpireColor), so the
 * suggestion always passes the same check the gateway runs on submit.
 */
export function suggestAlternative(desired: string, taken: ReadonlySet<string>): string {
  return nearestFreeEmpireColor(desired, colorsInUseOf(taken)) ?? "#ff00ff";
}

// -- palette selection ---------------------------------------------------------

/** Up to `count` colours a player could pick right now (shared freeEmpireColors). */
export function pickSuggestedPalette(count: number, taken: ReadonlySet<string>): string[] {
  return freeEmpireColors(count, colorsInUseOf(taken));
}

// -- deterministic AI assignment ------------------------------------------------

function fnv32(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A colour for an auto-assigned empire (guests): walks the palette from a
 * hash of `seed`, then the hue wheel, taking the first available colour.
 * When no colour is far enough from every active empire (a very crowded
 * map) it still returns one nobody holds exactly.
 */
export function assignUniqueColor(seed: string, taken: ReadonlySet<string>): string {
  const hash = fnv32(seed);
  const start = hash % BASE_PALETTE.length;
  let exactFree: string | undefined;

  // walk forward from hashed index
  for (let offset = 0; offset < BASE_PALETTE.length; offset++) {
    const idx = (start + offset) % BASE_PALETTE.length;
    const entry = BASE_PALETTE[idx];
    if (!entry || isTaken(entry, taken)) continue;
    if (isColorAvailable(entry, taken)) return entry;
    exactFree ??= entry;
  }

  // palette used up — generate via HSL rotation
  for (const generated of hueWheelCandidates(hash % 360)) {
    if (isTaken(generated, taken)) continue;
    if (isColorAvailable(generated, taken)) return generated;
    exactFree ??= generated;
  }

  // ultimate fallback (should never reach here)
  return exactFree ?? "#ff00ff";
}
