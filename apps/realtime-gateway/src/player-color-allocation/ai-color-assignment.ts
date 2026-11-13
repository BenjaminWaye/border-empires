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
// just red vs green) from every colour already handed out. Empires whose
// names start with the same letter share a crest letter on Ranks, so for
// them the distance must be twice as large to win. Deterministic: same ids
// and names, same colours, on every boot.

/** Below this HSL saturation a colour reads as grey (barbarian/neutral territory); never hand it to an AI. */
const MIN_SATURATION = 0.3;
/** OKLab lightness range that stays visible as a territory tint over both dark and light terrain. */
const MIN_LIGHTNESS = 0.42;
const MAX_LIGHTNESS = 0.88;
/** Same crest letter: the distance has to be this many times larger to count as far enough. */
const SAME_INITIAL_WEIGHT = 0.5;

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
export const AI_COLOR_CANDIDATES: readonly string[] = BASE_PALETTE.filter((hex) => {
  if (RESERVED_COLORS.has(hex)) return false;
  const l = hexToOkLab(hex).l;
  return saturation(hex) >= MIN_SATURATION && l >= MIN_LIGHTNESS && l <= MAX_LIGHTNESS;
});

const initialOf = (name: string | undefined): string => (name?.trim()[0] ?? "").toUpperCase();

/**
 * Colours for every id, keyed by id. `nameFor` gives the display name so
 * same-initial empires can be pushed further apart; `taken` colours are
 * avoided exactly and kept at a distance like any other assigned colour.
 */
export const assignAiColors = (
  ids: Iterable<string>,
  nameFor: (id: string) => string | undefined = () => undefined,
  taken: ReadonlySet<string> = new Set()
): Map<string, string> => {
  const assigned: Array<{ color: string; initial: string }> = [...taken].map((color) => ({ color, initial: "" }));
  const used = new Set<string>([...taken, ...RESERVED_COLORS]);
  const result = new Map<string, string>();
  for (const id of [...ids].sort()) {
    const initial = initialOf(nameFor(id));
    let best: string | undefined;
    let bestScore = -1;
    for (const candidate of AI_COLOR_CANDIDATES) {
      if (used.has(candidate)) continue;
      let score = Number.POSITIVE_INFINITY;
      for (const other of assigned) {
        const weight = initial !== "" && other.initial === initial ? SAME_INITIAL_WEIGHT : 1;
        score = Math.min(score, colorBlindSafeDistance(candidate, other.color) * weight);
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    // More AIs than candidates: fall back to any free palette entry.
    const color = best ?? BASE_PALETTE.find((hex) => !used.has(hex)) ?? "#ff00ff";
    used.add(color);
    assigned.push({ color, initial });
    result.set(id, color);
  }
  return result;
};
