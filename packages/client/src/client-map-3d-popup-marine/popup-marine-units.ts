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
import { ownedFactories, type MarineModelKey, type SquadGear, type WeaponsFactoryKind } from "./popup-marine-gear.js";
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
  /** How far ahead of the infantry's rank (tile-local units) a unit too big
   * to wait inside it stands during the lineup, leading the squad in
   * (popup-marine-roles.ts); 0 = waits in the rank. Big units sharing a
   * squad get different leads so they stagger in depth, not side by side. */
  lineupLead: number;
};

export const UNIT_PROFILES: Record<MarineUnitKind, MarineUnitProfile> = {
  infantry: { model: "standard", scale: 1, role: "line", lineupLead: 0 },
  // The titanium war-walker (bake-popup-marine-titanium-model.py) is baked
  // at a marine's height but about twice its width; at 1.5x it towers over
  // the infantry, and its roles keep it out of their rank (it leads the
  // lineup, then charges or holds the back rank) so it never fuses with
  // its neighbours.
  "titanium-assault": { model: "titanium", scale: 1.5, role: "charge", lineupLead: 0.3 },
  "titanium-gunner": { model: "titanium", scale: 1.5, role: "support", lineupLead: 0.12 },
  // Umbrite heavy trooper (bake-popup-marine-umbrite-model.py): marine-sized,
  // shoulder cannon, fires from a braced kneel.
  "umbrite-heavy": { model: "umbrite", scale: 1, role: "braced", lineupLead: 0 }
};

/** Each factory's specialists, most important first: when a squad can only
 * spare one slot per factory, the first one is the one it fields. */
export const FACTORY_SPECIALISTS: Record<WeaponsFactoryKind, readonly MarineUnitKind[]> = {
  titanium: ["titanium-assault", "titanium-gunner"],
  umbrite: ["umbrite-heavy", "umbrite-heavy"]
};

/** Most specialists a squad ever fields, so infantry stays its backbone. */
export const MAX_SPECIALISTS_PER_SQUAD = 4;
/** Slots per factory while the budget allows. */
export const SPECIALIST_SLOTS_PER_FACTORY = 2;

/** The specialists a squad fields for its factories: two each with one or
 * two factories, one each with three or four (so every factory still
 * shows), and beyond MAX_SPECIALISTS_PER_SQUAD factories the earliest in
 * WEAPONS_FACTORY_KINDS. */
export const squadSpecialistsFor = (gear: SquadGear | undefined): MarineUnitKind[] => {
  const factories = ownedFactories(gear).slice(0, MAX_SPECIALISTS_PER_SQUAD);
  if (factories.length === 0) return [];
  const perFactory = Math.max(1, Math.min(SPECIALIST_SLOTS_PER_FACTORY, Math.floor(MAX_SPECIALISTS_PER_SQUAD / factories.length)));
  return factories.flatMap((kind) => FACTORY_SPECIALISTS[kind].slice(0, perFactory));
};

// Specialists are drawn from the inner slots only: the outermost two sit at
// the formation's edge, where a bigger figure would be clamped against the
// tile boundary.
const INNER_SLOTS = Array.from({ length: MARINES_PER_SIDE - 2 }, (_, i) => i + 1);

/** Who fills each of a side's MARINES_PER_SIDE slots. Deterministic per
 * tile seed and side, so a skirmish, the battle it resolves into and the
 * garrison it leaves behind all field the same units in the same slots. */
export const squadUnitsFor = (gear: SquadGear | undefined, seed: number, side: 0 | 1): MarineUnitKind[] => {
  const units: MarineUnitKind[] = Array.from({ length: MARINES_PER_SIDE }, () => "infantry");
  const specialists = squadSpecialistsFor(gear);
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
