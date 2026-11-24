// The cosmetic war industry behind one side's battle squad: which weapons
// factories its empire owns (the server's CombatBroadcastPayload
// attackerGear/defenderGear, remembered per owner by client-battle-overlay.ts
// so a pre-resolution skirmish already shows it). Each factory adds its own
// touch to the same squad -- Titanium: every soldier wears the heavy armour
// model (marineModelFor, popup-marine-asset.ts); Umbrite: Umbrite rounds
// instead of standard bolts (popup-marine-shot-render.ts) -- so any
// combination just composes. Purely cosmetic: the combat bonuses themselves
// are applied server-side regardless of what renders.
//
// Adding a weapons factory: add its kind here with its wire flag (the
// matching BattleWarGear field the simulation sets in battleWarGearFor) and
// its structure type, then give it a look where the squad is drawn.
import type { AncillariesCosmeticId } from "@border-empires/shared";

/** Every weapons factory type with a battle look. */
export const WEAPONS_FACTORY_KINDS = ["titanium", "umbrite"] as const;
export type WeaponsFactoryKind = (typeof WEAPONS_FACTORY_KINDS)[number];

/** The BattleWarGear flag (sim-protocol) that says a side owns each factory. */
export const WIRE_FLAG_BY_FACTORY = {
  titanium: "titaniumArmor",
  umbrite: "umbriteArms"
} as const satisfies Record<WeaponsFactoryKind, string>;
export type WireWarGear = Partial<Record<(typeof WIRE_FLAG_BY_FACTORY)[WeaponsFactoryKind], boolean>>;

/** The structure whose ownership grants each factory's gear -- the same
 * existence check the simulation's battleWarGearFor makes. */
export const STRUCTURE_BY_FACTORY = {
  titanium: "TITANIUM_WEAPONS_FACTORY",
  umbrite: "UMBRITE_WEAPONS_FACTORY"
} as const satisfies Record<WeaponsFactoryKind, string>;

/** A squad's factories, plus the ancillaries cosmetic its House shows
 * (`skin`, added on the client by withSquadSkin in client-cosmetics.ts --
 * never sent by the server, never read by combat). */
export type SquadGear = Partial<Record<WeaponsFactoryKind, boolean>> & { skin?: AncillariesCosmeticId };

/** The soldier models a squad can wear: the standard marine, the heavy
 * armour of an empire running a Titanium Weapons Factory, or the paid Lancet
 * guard look. */
export const MARINE_MODEL_KEYS = ["standard", "heavy", "lancet"] as const;
export type MarineModelKey = (typeof MARINE_MODEL_KEYS)[number];

/** One empty slot per model, for the overlays that pool soldiers by model. */
export const perMarineModel = <T>(make: () => T): Record<MarineModelKey, T> =>
  ({ standard: make(), heavy: make(), lancet: make() });

/** Whether a model's bake carries the _MASK surface classes (bare metal,
 * glow) that createMarineMaterial reads; only the original marine lacks it. */
export const marineModelSurfaceMasked = (model: MarineModelKey): boolean => model !== "standard";

/** Titanium armour wins over the cosmetic: the heavy model is how a rival
 * reads that a squad fights with a Titanium Weapons Factory's bonus, and a
 * paid look must never hide strength (docs/gdd.md §8). */
export const marineModelFor = (gear: SquadGear | undefined): MarineModelKey => {
  if (gear?.titanium === true) return "heavy";
  return gear?.skin === "ancillaries-lancet-guard" ? "lancet" : "standard";
};

/** Per-side gear on a battle/skirmish render entry; absent = no factories. */
export type SquadGearFields = {
  attackerGear?: SquadGear;
  defenderGear?: SquadGear;
};

export const ownedFactories = (gear: SquadGear | undefined): WeaponsFactoryKind[] =>
  WEAPONS_FACTORY_KINDS.filter((kind) => gear?.[kind] === true);

/** Gear from a set of owned structure types (e.g. the local player's own
 * tiles, which the client sees directly). */
export const squadGearFromStructures = (owned: ReadonlySet<string>): SquadGear => {
  const gear: SquadGear = {};
  for (const kind of WEAPONS_FACTORY_KINDS) if (owned.has(STRUCTURE_BY_FACTORY[kind])) gear[kind] = true;
  return gear;
};

export const squadGearFromWire = (wire: WireWarGear | undefined): SquadGear => {
  const gear: SquadGear = {};
  for (const kind of WEAPONS_FACTORY_KINDS) if (wire?.[WIRE_FLAG_BY_FACTORY[kind]] === true) gear[kind] = true;
  return gear;
};
