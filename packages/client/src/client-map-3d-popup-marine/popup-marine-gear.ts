// The cosmetic war industry behind one side's battle squad: which weapons
// factories its empire owns (the server's CombatBroadcastPayload
// attackerGear/defenderGear, remembered per owner by client-battle-overlay.ts
// so a pre-resolution skirmish already shows it). Gear never picks a whole
// squad's look -- popup-marine-units.ts turns it into a mixed squad (a few
// specialist slots among the infantry), so any combination of factories just
// composes, with no per-combination choreography. Purely cosmetic: the combat
// bonuses themselves are applied server-side regardless of what renders.
export type SquadGear = { titanium?: boolean; umbrite?: boolean };

/** Per-side gear on a battle/skirmish render entry; absent = no factories. */
export type SquadGearFields = {
  attackerGear?: SquadGear;
  defenderGear?: SquadGear;
};

/** Which loaded .glb a marine slot is cloned from (popup-marine-asset.ts). */
export type MarineModelKey = "standard" | "titanium";
