// Unit registry + squad composition for the battle overlay. A squad is
// always MARINES_PER_SIDE figures sharing one choreography
// (popup-marine-timeline.ts); what varies is WHO fills each slot. Each
// weapons factory an empire owns swaps a few of its infantry slots for that
// factory's specialists, so factories compose -- titanium, Umbrite, both, or
// a future one -- by adding registry entries, never per-combination
// sequences. Each unit's own behaviour comes from its profile here plus its
// role in popup-marine-roles.ts.
//
// Pure data/math, no three.js import, so it is unit-tested in node.
import type { MarineModelKey, SquadGear } from "./popup-marine-gear.js";
import { hash01, MARINES_PER_SIDE } from "./popup-marine-timeline.js";

export type MarineUnitKind = "infantry" | "titanium-assault" | "titanium-gunner" | "umbrite-heavy";

export type MarineUnitRole =
  /** Holds its own spot on the firing line and shoots (the default). */
  | "line"
  /** Keeps going past the firing line into melee with an enemy. */
  | "charge"
  /** Holds the back rank and fires over the line. */
  | "support"
  /** Fires from a braced kneel. */
  | "braced";

export type MarineUnitProfile = {
  model: MarineModelKey;
  /** Size relative to the shared MARINE_MODEL_SCALE. */
  scale: number;
  role: MarineUnitRole;
};

export const UNIT_PROFILES: Record<MarineUnitKind, MarineUnitProfile> = {
  infantry: { model: "standard", scale: 1, role: "line" },
  // The titanium war-walker (bake-popup-marine-titanium-model.py) is baked
  // at a marine's height but about twice its width; a little extra size
  // here sells its weight, and the roles keep it out of the infantry's rank
  // so it never fuses with its neighbours.
  "titanium-assault": { model: "titanium", scale: 1.2, role: "charge" },
  "titanium-gunner": { model: "titanium", scale: 1.2, role: "support" },
  // Umbrite heavy-weapon trooper. Its own model is not made yet, so it wears
  // the standard marine and is told apart by its braced firing stance until
  // then -- give it a model key once one exists.
  "umbrite-heavy": { model: "standard", scale: 1, role: "braced" }
};

/** How many of a squad's slots each owned weapons factory converts. */
export const SPECIALIST_SLOTS_PER_FACTORY = 2;

// Specialists are drawn from the inner slots only: the outermost two sit at
// the formation's edge, where a bigger figure would be clamped against the
// tile boundary.
const INNER_SLOTS = Array.from({ length: MARINES_PER_SIDE - 2 }, (_, i) => i + 1);

/** Who fills each of a side's MARINES_PER_SIDE slots. Deterministic per
 * tile seed and side, so a skirmish, the battle it resolves into and the
 * garrison it leaves behind all field the same units in the same slots. */
export const squadUnitsFor = (gear: SquadGear | undefined, seed: number, side: 0 | 1): MarineUnitKind[] => {
  const units: MarineUnitKind[] = Array.from({ length: MARINES_PER_SIDE }, () => "infantry");
  const specialists: MarineUnitKind[] = [
    ...(gear?.titanium ? (["titanium-assault", "titanium-gunner"] as const) : []),
    ...(gear?.umbrite ? (["umbrite-heavy", "umbrite-heavy"] as const) : [])
  ];
  if (specialists.length === 0) return units;
  const order = [...INNER_SLOTS].sort((a, b) => hash01(seed * 31 + a, side, 77) - hash01(seed * 31 + b, side, 77));
  const taken: number[] = [];
  for (const kind of specialists) {
    // Walkers are big: never put two side by side in the lineup.
    const big = UNIT_PROFILES[kind].scale > 1;
    const clear = (slot: number): boolean =>
      !taken.includes(slot) && (!big || !taken.some((t) => UNIT_PROFILES[units[t]!].scale > 1 && Math.abs(t - slot) < 2));
    const slot = order.find(clear) ?? order.find((s) => !taken.includes(s));
    if (slot === undefined) break;
    units[slot] = kind;
    taken.push(slot);
  }
  return units;
};
