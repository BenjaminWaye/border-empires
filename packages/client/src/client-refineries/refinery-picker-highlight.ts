// What the map highlights while a refinery picker is open (docs/territory-
// development-plan.md, Phase 2, Client): the town's 10-land-tile reach, the
// fields it could take (eligible bright, taken / unlinked greyed), the field
// the player is pointing at, and -- for "Refine at…" -- the ring tile the
// refinery would stand on. One picker is open at a time, so this is a single
// slot both renderers read each frame (2D: refinery-canvas-2d.ts, true-3D:
// refinery-highlight-3d.ts); it is cleared when the picker closes.

export type RefineryHighlightTone = "reach" | "eligible" | "taken" | "unlinked" | "focus" | "site";

export type RefineryPickerHighlight = ReadonlyMap<string, RefineryHighlightTone>;

let active: RefineryPickerHighlight | undefined;

export const setRefineryPickerHighlight = (next: RefineryPickerHighlight | undefined): void => { active = next; };
export const refineryPickerHighlight = (): RefineryPickerHighlight | undefined => active;

// Later layers win: a field tile inside the reach shows as the field, the focused field over its status.
const TONE_RANK: Record<RefineryHighlightTone, number> = { reach: 0, unlinked: 1, taken: 2, eligible: 3, focus: 4, site: 5 };

/** Builds a highlight from layers, keeping the strongest tone per tile. */
export const buildRefineryHighlight = (layers: ReadonlyArray<{ keys: Iterable<string>; tone: RefineryHighlightTone }>): RefineryPickerHighlight => {
  const map = new Map<string, RefineryHighlightTone>();
  for (const { keys, tone } of layers) {
    for (const key of keys) {
      const current = map.get(key);
      if (!current || TONE_RANK[tone] >= TONE_RANK[current]) map.set(key, tone);
    }
  }
  return map;
};

/** Fill / edge colours per tone, shared by both renderers so they read the same. */
export const REFINERY_HIGHLIGHT_COLORS: Readonly<Record<RefineryHighlightTone, { fill: string; alpha: number; edge: string }>> = {
  reach: { fill: "#d9b25c", alpha: 0.1, edge: "#d9b25c" },
  eligible: { fill: "#5fd07a", alpha: 0.32, edge: "#9df0b1" },
  taken: { fill: "#8b8b8b", alpha: 0.3, edge: "#b5b5b5" },
  unlinked: { fill: "#6d6d6d", alpha: 0.26, edge: "#9a8f80" },
  focus: { fill: "#ffe08a", alpha: 0.45, edge: "#fff3c4" },
  site: { fill: "#64c8ff", alpha: 0.42, edge: "#c8ecff" }
};
