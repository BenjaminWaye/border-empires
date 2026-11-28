import { ciede2000Lab, hexToLab, type Lab } from "../empire-color-distance/ciede2000.js";
import { MIN_EMPIRE_COLOR_DELTA_E, tooCloseColorReason, type EmpireColorEntry } from "../empire-color-distance/empire-color-distance.js";
import { EMPIRE_COLOR_PALETTE, allEmpireColorCandidates, hueWheelCandidates } from "./empire-color-palette.js";

// The one rule for picking an empire colour, run by the gateway on submit and
// by the client inline, against the same colours in use (the gateway sends
// its set to the client). A pick is refused when another empire holds that
// exact colour (`exact`: every stored profile plus reserved colours) or when
// it is closer than MIN_EMPIRE_COLOR_DELTA_E to an active empire (`empires`).
// Suggestions are drawn from the same candidates and checked with the same
// rule, so a suggestion is always accepted.
//
// A full map: ΔE 15 packs at most about 67 colours into sRGB (greedy, dense
// grid) and about 45 over our candidates, fewer than 20 AI empires plus every
// player active in the window. When no candidate keeps the distance, the
// distance part of the rule is suspended (an exact match is still refused)
// and suggestions become the least-clashing colours, so a new player is
// never locked out of the map. That fallback is a design call pending owner
// review (PR description); MIN_EMPIRE_COLOR_DELTA_E itself is unchanged.

export type EmpireColorsInUse = { readonly exact: readonly string[]; readonly empires: readonly EmpireColorEntry[] };

export const EMPIRE_COLOR_TAKEN_REASON = "That colour is already taken by another empire.";

export type EmpireColorRejection = { readonly message: string; readonly clash?: EmpireColorEntry };

const HEX6 = /^#[0-9a-f]{6}$/;

// Lab values of the candidates (and any other colour checked), computed once
// per process: the candidate scans run on the gateway's main thread.
const labCache = new Map<string, Lab>();
const MAX_LAB_CACHE = 8_192;
const labOf = (hex: string): Lab => {
  let lab = labCache.get(hex);
  if (!lab) {
    lab = hexToLab(hex);
    if (labCache.size < MAX_LAB_CACHE) labCache.set(hex, lab);
  }
  return lab;
};

/** Builds a checker once per set of colours in use (Lab values cached), for scanning many candidates. */
export const empireColorChecker = (inUse: EmpireColorsInUse) => {
  const exact = new Set(inUse.exact.map((hex) => hex.toLowerCase()));
  const empires: { entry: EmpireColorEntry; lab: Lab }[] = [];
  for (const entry of inUse.empires) {
    const color = entry.color.toLowerCase();
    if (HEX6.test(color)) empires.push({ entry, lab: labOf(color) });
  }
  const isExactTaken = (hex: string): boolean => exact.has(hex) || empires.some((empire) => empire.entry.color.toLowerCase() === hex);
  // Distance from a colour to the nearest active empire, and that empire.
  // Memoised per checker: the full-map test and the least-clashing order scan the same candidates.
  const nearestByHex = new Map<string, { clash?: EmpireColorEntry; distance: number }>();
  const nearestEmpire = (hex: string): { clash?: EmpireColorEntry; distance: number } => {
    const known = nearestByHex.get(hex);
    if (known) return known;
    const result = measureNearest(hex);
    nearestByHex.set(hex, result);
    return result;
  };
  const measureNearest = (hex: string): { clash?: EmpireColorEntry; distance: number } => {
    const lab = labOf(hex);
    let clash: EmpireColorEntry | undefined;
    let distance = Number.POSITIVE_INFINITY;
    for (const empire of empires) {
      const d = ciede2000Lab(lab, empire.lab);
      if (d < distance) {
        clash = empire.entry;
        distance = d;
      }
    }
    return clash ? { clash, distance } : { distance };
  };
  const keepsDistance = (hex: string): boolean => !isExactTaken(hex) && nearestEmpire(hex).distance >= MIN_EMPIRE_COLOR_DELTA_E;
  let full: boolean | undefined;
  /** True when no candidate keeps the distance from every active empire. */
  const isFull = (): boolean => (full ??= !allEmpireColorCandidates().some(keepsDistance));
  const rejection = (rawHex: string): EmpireColorRejection | undefined => {
    const hex = rawHex.trim().toLowerCase();
    if (isExactTaken(hex)) return { message: EMPIRE_COLOR_TAKEN_REASON };
    if (!HEX6.test(hex)) return undefined;
    const { clash, distance } = nearestEmpire(hex);
    if (!clash || distance >= MIN_EMPIRE_COLOR_DELTA_E || isFull()) return undefined;
    return { message: tooCloseColorReason(clash.name), clash };
  };
  /** Candidates nobody holds exactly, furthest from every active empire first: the full-map fallback. */
  const leastClashing = (): string[] =>
    allEmpireColorCandidates()
      .filter((hex) => !isExactTaken(hex))
      .map((hex) => ({ hex, distance: nearestEmpire(hex).distance }))
      .sort((a, b) => b.distance - a.distance || (a.hex < b.hex ? -1 : 1))
      .map((candidate) => candidate.hex);
  return { rejection, isFree: (hex: string): boolean => rejection(hex) === undefined, isFull, leastClashing };
};

/** Why `hex` may not be picked, or undefined when it may. */
export const empireColorRejection = (hex: string, inUse: EmpireColorsInUse): EmpireColorRejection | undefined =>
  empireColorChecker(inUse).rejection(hex);

/** Up to `count` free colours to offer as swatches: palette order first, then every other candidate. */
export const freeEmpireColors = (count: number, inUse: EmpireColorsInUse): string[] => {
  const checker = empireColorChecker(inUse);
  if (checker.isFull()) return checker.leastClashing().slice(0, count);
  const { isFree } = checker;
  const result: string[] = [];
  for (const hex of allEmpireColorCandidates()) {
    if (result.length >= count) break;
    if (isFree(hex)) result.push(hex);
  }
  return result;
};

const rgbDistance = (a: string, b: string): number => {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.hypot(channel(a, 0) - channel(b, 0), channel(a, 1) - channel(b, 1), channel(a, 2) - channel(b, 2));
};

// A suggestion must look like a different choice from the refused colour,
// not a one-step nudge of it (kept from the gateway's old suggestAlternative).
const MIN_SUGGESTION_RGB_DISTANCE = 22;

/**
 * The free colour nearest (CIEDE2000) to `desired`; on a full map the
 * least-clashing colour. Every result passes empireColorRejection for
 * `inUse`; undefined only if every candidate is held exactly.
 */
export const nearestFreeEmpireColor = (desired: string, inUse: EmpireColorsInUse): string | undefined => {
  const target = desired.trim().toLowerCase();
  if (!HEX6.test(target)) return freeEmpireColors(1, inUse)[0];
  const checker = empireColorChecker(inUse);
  if (checker.isFull()) return checker.leastClashing()[0];
  const { isFree } = checker;
  const targetLab = labOf(target);
  const ranked = allEmpireColorCandidates()
    .filter((hex) => rgbDistance(hex, target) >= MIN_SUGGESTION_RGB_DISTANCE)
    .map((hex) => ({ hex, distance: ciede2000Lab(targetLab, labOf(hex)) }))
    .sort((a, b) => a.distance - b.distance || (a.hex < b.hex ? -1 : 1));
  return ranked.find((candidate) => isFree(candidate.hex))?.hex;
};

export { EMPIRE_COLOR_PALETTE, allEmpireColorCandidates, hueWheelCandidates };
