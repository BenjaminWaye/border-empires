// Which model a battle squad wears. "titanium" is the heavier-plated marine
// an empire's squads switch to once it owns a Titanium Weapons Factory (the
// server's CombatBroadcastPayload.attackerGear/defenderGear, remembered per
// owner by client-battle-overlay.ts's knownTitaniumArmorOwners so a
// pre-resolution skirmish already shows it). Purely cosmetic: the combat
// bonus itself is applied server-side regardless of what renders.
export type MarineArmor = "standard" | "titanium";

/** Per-side armour on a battle/skirmish render entry; absent = standard. */
export type SquadArmorFields = {
  attackerArmor?: MarineArmor;
  defenderArmor?: MarineArmor;
};
