import { MIN_EMPIRE_COLOR_DELTA_E, ciede2000Lab, hexToLab, type Lab } from "@border-empires/shared";
import { BASE_PALETTE, RESERVED_COLORS } from "./player-color-allocation.js";
import { colorBlindSafeDistance, hexToOkLab } from "./perceptual-color-distance.js";

// Picks the seeded AI empires' colours so they stay apart for every viewer,
// colour-blind ones included. The old seeding walked the palette from a hash
// of each AI id and only rejected exact duplicates, which handed out three
// near-identical reds and four greens in a 20-AI world -- and gave the two
// "A" empires (Alden #39ff14, Astrid #f44336) a red/green pair that a
// deuteranope can't tell apart.
//
// Now each AI, in sorted-id order, takes the candidate that is furthest
// (colorBlindSafeDistance, so lightness and the blue-yellow axis count, not
// just red vs green) from every colour already handed out. Empires that
// share an emblem mark (the same crest, or the same initial when there is no
// crest) must be twice as far apart to win. Deterministic: same ids
// and names, same colours, on every boot.
//
// Owner rule (2026-11-27): only candidates at least MIN_EMPIRE_COLOR_DELTA_E
// (CIEDE2000) from every colour already handed out, and from the `taken`
// colours of active human empires, may win. When the palette has none left,
// generated hue-wheel colours are tried; when nothing at all is far enough
// (more empires than the colour space holds, e.g. a 60-AI sector) the
// candidate furthest from the rest wins.

/** Below this HSL saturation a colour reads as grey (barbarian/neutral territory); never hand it to an AI. */
const MIN_SATURATION = 0.3;
/** OKLab lightness range that stays visible as a territory tint over both dark and light terrain. */
const MIN_LIGHTNESS = 0.42;
const MAX_LIGHTNESS = 0.88;
/** Same crest letter: the distance has to be this many times larger to count as far enough. */
const SAME_INITIAL_WEIGHT = 0.5;

const isTintable = (hex: string): boolean => {
  if (RESERVED_COLORS.has(hex)) return false;
  const l = hexToOkLab(hex).l;
  return saturation(hex) >= MIN_SATURATION && l >= MIN_LIGHTNESS && l <= MAX_LIGHTNESS;
};

const saturation = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
};

/** BASE_PALETTE entries an AI may be given: saturated, mid-light, not reserved. */
export const AI_COLOR_CANDIDATES: readonly string[] = BASE_PALETTE.filter((hex) => isTintable(hex));

const hslHex = (h: number, s: number, l: number): string => {
  const k = (n: number): number => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, "0");
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

/** colorBlindSafeDistance below which two colours read as one to a colour-blind viewer. */
const COLOR_BLIND_MIN_DISTANCE = 0.05;

/** Hue-wheel colours tried once no palette candidate is far enough. */
export const AI_EXTRA_COLOR_CANDIDATES: readonly string[] = (() => {
  const extras = new Set<string>();
  for (const l of [0.5, 0.62, 0.42, 0.74]) {
    for (const s of [0.85, 0.6]) {
      for (let h = 0; h < 360; h += 8) {
        const hex = hslHex(h, s, l);
        if (isTintable(hex) && !AI_COLOR_CANDIDATES.includes(hex)) extras.add(hex);
      }
    }
  }
  return [...extras];
})();

const ALL_AI_CANDIDATES: readonly string[] = [...AI_COLOR_CANDIDATES, ...AI_EXTRA_COLOR_CANDIDATES];

/** The emblem mark of a House shown by its letter: its name's initial. */
export const initialOf = (name: string | undefined): string => (name?.trim()[0] ?? "").toUpperCase();

/**
 * Colours for every id, keyed by id. `markFor` gives the emblem mark (a crest
 * id, or initialOf a name) so empires with the same mark can be pushed further
 * apart; `taken` colours are avoided exactly and kept at a distance like any
 * other assigned colour. `takenInitials` (colour -> emblem mark) lets a taken
 * colour that belongs to an AI keep the same-mark spacing from the AIs
 * assigned here.
 */
export const assignAiColors = (
  ids: Iterable<string>,
  markFor: (id: string) => string | undefined = () => undefined,
  taken: ReadonlySet<string> = new Set(),
  takenInitials: ReadonlyMap<string, string> = new Map()
): Map<string, string> => {
  const labs = new Map<string, Lab>();
  const labOf = (hex: string): Lab => {
    let lab = labs.get(hex);
    if (!lab) labs.set(hex, (lab = hexToLab(hex)));
    return lab;
  };
  const assigned: Array<{ color: string; initial: string }> = [...taken].map((color) => ({ color, initial: takenInitials.get(color) ?? "" }));
  const used = new Set<string>([...taken, ...RESERVED_COLORS]);
  const result = new Map<string, string>();
  const minDeltaE = (candidate: string): number => {
    let min = Number.POSITIVE_INFINITY;
    for (const other of assigned) min = Math.min(min, ciede2000Lab(labOf(candidate), labOf(other.color)));
    return min;
  };
  // Of the candidates far enough from every assigned colour, the one furthest
  // apart for colour-blind viewers (same-initial empires weighted closer).
  const bestFarEnough = (candidates: readonly string[], initial: string, minScore: number): string | undefined => {
    let best: string | undefined;
    let bestScore = minScore;
    for (const candidate of candidates) {
      if (used.has(candidate) || minDeltaE(candidate) < MIN_EMPIRE_COLOR_DELTA_E) continue;
      let score = Number.POSITIVE_INFINITY;
      for (const other of assigned) {
        const weight = initial !== "" && other.initial === initial ? SAME_INITIAL_WEIGHT : 1;
        score = Math.min(score, colorBlindSafeDistance(candidate, other.color) * weight);
      }
      if (score > bestScore || (best === undefined && score >= bestScore)) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  };
  // Nothing far enough: the free candidate furthest (CIEDE2000) from the rest.
  const leastClose = (): string | undefined => {
    let best: string | undefined;
    let bestDistance = -1;
    for (const candidate of ALL_AI_CANDIDATES) {
      if (used.has(candidate)) continue;
      const distance = minDeltaE(candidate);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return best;
  };
  for (const id of [...ids].sort()) {
    const initial = markFor(id) ?? "";
    const color =
      bestFarEnough(AI_COLOR_CANDIDATES, initial, COLOR_BLIND_MIN_DISTANCE) ??
      bestFarEnough(AI_EXTRA_COLOR_CANDIDATES, initial, COLOR_BLIND_MIN_DISTANCE) ??
      bestFarEnough(ALL_AI_CANDIDATES, initial, -1) ??
      leastClose() ??
      BASE_PALETTE.find((hex) => !used.has(hex)) ??
      "#ff00ff";
    used.add(color);
    assigned.push({ color, initial });
    result.set(id, color);
  }
  return result;
};
