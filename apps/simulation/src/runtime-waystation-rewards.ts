import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import { WAYSTATION_GOLD_TIERS, WAYSTATION_MANPOWER_GRANT, type WaystationGoldTier } from "@border-empires/shared";
import { grantOverflowManpower } from "./runtime-manpower-ceiling.js";

type WaystationResult = NonNullable<DomainTileState["waystation"]>;

/**
 * Weighted pick over WAYSTATION_GOLD_TIERS using one draw of the injected
 * `random` (the second draw of an activation, after the effect roll -- tests
 * rely on that order).
 */
export const rollWaystationGoldTier = (random: () => number): { tier: WaystationGoldTier; amount: number } => {
  const totalWeight = WAYSTATION_GOLD_TIERS.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * totalWeight;
  for (const entry of WAYSTATION_GOLD_TIERS) {
    if (roll < entry.weight) return { tier: entry.tier, amount: entry.amount };
    roll -= entry.weight;
  }
  const last = WAYSTATION_GOLD_TIERS[WAYSTATION_GOLD_TIERS.length - 1]!;
  return { tier: last.tier, amount: last.amount };
};

/**
 * Grants the GOLD effect (also the fallback for a TECH roll with no unowned
 * tier-1 tech left): a flat-tier amount added straight to the treasury. The
 * PLAYER_UPDATE the lock-resolution/settle path already emits afterwards
 * carries the new balance to the client.
 */
export const grantWaystationGold = (player: DomainPlayer, random: () => number): { tier: WaystationGoldTier; amount: number } => {
  const rolled = rollWaystationGoldTier(random);
  player.points += rolled.amount;
  return rolled;
};

/**
 * Grants the MANPOWER effect: WAYSTATION_MANPOWER_GRANT on top of the player's
 * current manpower, allowed to overflow the cap (see runtime-manpower-ceiling.ts).
 * `refreshManpower` settles accrued regen first so the grant lands on the real
 * current balance rather than a stale one.
 */
export const grantWaystationManpower = (
  player: DomainPlayer,
  deps: { refreshManpower: (playerId: string) => void; playerManpowerCap: (playerId: string) => number }
): number => {
  deps.refreshManpower(player.id);
  grantOverflowManpower(player, WAYSTATION_MANPOWER_GRANT, deps.playerManpowerCap(player.id));
  return WAYSTATION_MANPOWER_GRANT;
};

/**
 * The optional per-effect detail fields of an activation result, in the flat
 * shape shared by the player event log and the personal-impact log -- one
 * copy instead of the same spread list at each record site.
 */
export const waystationResultDetailFields = (result: WaystationResult) => ({
  ...(typeof result.revealedAtX === "number" ? { revealedAtX: result.revealedAtX } : {}),
  ...(typeof result.revealedAtY === "number" ? { revealedAtY: result.revealedAtY } : {}),
  ...(result.grantedTechId ? { grantedTechId: result.grantedTechId } : {}),
  ...(result.grantedResource ? { grantedResource: result.grantedResource } : {}),
  ...(result.grantedTownName ? { grantedTownName: result.grantedTownName } : {}),
  ...(typeof result.grantedTownX === "number" ? { grantedTownX: result.grantedTownX } : {}),
  ...(typeof result.grantedTownY === "number" ? { grantedTownY: result.grantedTownY } : {}),
  ...(typeof result.grantedGold === "number" ? { grantedGold: result.grantedGold } : {}),
  ...(result.grantedGoldTier ? { grantedGoldTier: result.grantedGoldTier } : {}),
  ...(typeof result.grantedManpower === "number" ? { grantedManpower: result.grantedManpower } : {})
});
