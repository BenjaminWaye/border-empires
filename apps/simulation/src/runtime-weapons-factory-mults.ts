import {
  NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT,
  noWarIndustryLabel,
  TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING,
  UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING,
  WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING,
  type BuildableStructureType
} from "@border-empires/shared";

// Weapons Workshop/Titanium/Umbrite Weapons Factory combat-mult helpers and
// the "no war industry" vulnerability check, split out of
// runtime-combat-support.ts to keep that file under the repo's 500-line cap.
// Takes just the one piece of RuntimeCombatSupportContext these helpers
// need, rather than importing the full context type (which would create a
// circular import back to runtime-combat-support.ts).
export type WeaponsFactoryMultContext = {
  ownedStructureCountForPlayer: (playerId: string, structureType: BuildableStructureType) => number;
};

// Weapons Workshop is retired (structure-registry-economic.ts) — replaced by
// Titanium/Umbrite Weapons Factory below — but any copy a player already owns
// from before the retirement still grants its bonus (no data migration for a
// live game), so this stays wired exactly as before.
export const weaponsWorkshopAttackMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "WEAPONS_WORKSHOP") * WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING : 1;

export const weaponsWorkshopDefenseMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "WEAPONS_WORKSHOP") * WEAPONS_WORKSHOP_DEFENSE_MULT_PER_BUILDING : 1;

// Titanium/Umbrite Weapons Factory: both grant attack AND defense per copy
// (never zero on either axis), just weighted differently — Titanium leans
// defense, Umbrite leans attack. Empire-wide, same as Weapons Workshop —
// every active copy the player owns anywhere contributes, regardless of
// which town network it's connected to or how far it is from the fight.
export const titaniumWeaponsFactoryAttackMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "TITANIUM_WEAPONS_FACTORY") * TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING : 1;

export const titaniumWeaponsFactoryDefenseMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "TITANIUM_WEAPONS_FACTORY") * TITANIUM_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING : 1;

export const umbriteWeaponsFactoryAttackMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "UMBRITE_WEAPONS_FACTORY") * UMBRITE_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING : 1;

export const umbriteWeaponsFactoryDefenseMultForPlayer = (ctx: WeaponsFactoryMultContext, playerId: string | undefined): number =>
  playerId ? 1 + ctx.ownedStructureCountForPlayer(playerId, "UMBRITE_WEAPONS_FACTORY") * UMBRITE_WEAPONS_FACTORY_DEFENSE_MULT_PER_BUILDING : 1;

// "Unarmed" vulnerability (design doc, confirmed scope): owning zero of a
// factory type ANYWHERE in one's empire (existence check, not network-scoped)
// hands the OTHER side the same flat multiplier on their effective power.
// Missing one type or both is the same flat multiplier — no stacking to 4x.
export const hasTitaniumFactory = (ctx: WeaponsFactoryMultContext, ownerId: string): boolean =>
  ctx.ownedStructureCountForPlayer(ownerId, "TITANIUM_WEAPONS_FACTORY") > 0;
export const hasUmbriteFactory = (ctx: WeaponsFactoryMultContext, ownerId: string): boolean =>
  ctx.ownedStructureCountForPlayer(ownerId, "UMBRITE_WEAPONS_FACTORY") > 0;
const hasWarIndustry = (ctx: WeaponsFactoryMultContext, ownerId: string): boolean =>
  hasTitaniumFactory(ctx, ownerId) && hasUmbriteFactory(ctx, ownerId);
export const noWarIndustryVulnerabilityMultForDefender = (ctx: WeaponsFactoryMultContext, defenderOwnerId: string | undefined): number =>
  defenderOwnerId && !hasWarIndustry(ctx, defenderOwnerId) ? NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT : 1;
export const noWarIndustryVulnerabilityMultForAttacker = (ctx: WeaponsFactoryMultContext, attackerOwnerId: string): number =>
  hasWarIndustry(ctx, attackerOwnerId) ? 1 : NO_WAR_INDUSTRY_ATTACK_VULNERABILITY_MULT;

export const noWarIndustryVulnerabilityLabelForDefender = (ctx: WeaponsFactoryMultContext, defenderOwnerId: string): string =>
  noWarIndustryLabel("Target", hasTitaniumFactory(ctx, defenderOwnerId), hasUmbriteFactory(ctx, defenderOwnerId));
export const noWarIndustryVulnerabilityLabelForAttacker = (ctx: WeaponsFactoryMultContext, attackerOwnerId: string): string =>
  noWarIndustryLabel("Attacker", hasTitaniumFactory(ctx, attackerOwnerId), hasUmbriteFactory(ctx, attackerOwnerId));
