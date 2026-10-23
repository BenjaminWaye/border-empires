// The cosmetic war industry behind one side's battle squad: which weapons
// factories its empire owns (the server's CombatBroadcastPayload
// attackerGear/defenderGear, remembered per owner by client-battle-overlay.ts
// so a pre-resolution skirmish already shows it). Gear never picks a whole
// squad's look -- popup-marine-units.ts turns it into a mixed squad (a few
// specialist slots among the infantry), so any combination of factories just
// composes, with no per-combination choreography. Purely cosmetic: the combat
// bonuses themselves are applied server-side regardless of what renders.
//
// Adding a weapons factory: add its kind here with its wire flag (the
// matching BattleWarGear field the simulation sets in battleWarGearFor) and
// its structure type, then give it specialists in popup-marine-units.ts's
// FACTORY_SPECIALISTS.

/** Every weapons factory type that fields specialists, in priority order
 * (when a squad's specialist budget runs out, earlier factories win). */
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

export type SquadGear = Partial<Record<WeaponsFactoryKind, boolean>>;

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

/** Which loaded .glb a marine slot is cloned from (popup-marine-asset.ts). */
export type MarineModelKey = "standard" | "titanium" | "umbrite";
