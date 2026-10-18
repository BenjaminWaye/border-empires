import type { DomainPlayer } from "@border-empires/game-domain";
import { AFC_SPECIALIZATION_BALANCE, usesAfcSpecializations } from "@border-empires/shared";
import { multiplicativeEffectForPlayer, additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { pruneAfcRecords } from "./afc-battle-effects.js";

import { afcCampaignGuardCounters } from "./afc-diagnostics.js";
export { afcCampaignGuardCounters, afcCampaignStateGauges } from "./afc-diagnostics.js";

export function recordAfcHostileCapture(players: ReadonlyMap<string, DomainPlayer>, firstId: string, secondId: string | undefined, now: number): number | undefined {
  if (!secondId || firstId === secondId || firstId.startsWith("barbarian-") || secondId.startsWith("barbarian-")) return undefined;
  const first = players.get(firstId);
  const second = players.get(secondId);
  if (!first || !second || (!usesAfcSpecializations(first) && !usesAfcSpecializations(second))) return undefined;
  const until = now + AFC_SPECIALIZATION_BALANCE.warDurationMs;
  for (const [player, other] of [[first, second], [second, first]] as const) {
    const wars = (player.afcCampaign ??= {}).wars ??= {};
    wars[other.id] = until;
    pruneAfcRecords(wars, now, count => { afcCampaignGuardCounters.warEvictions += count; });
  }
  return until;
}

export interface AfcAlliancePeer { id: string; allies: ReadonlySet<string> }
export function mutualAfcAllies<T extends AfcAlliancePeer>(player: AfcAlliancePeer, players: ReadonlyMap<string, T>): T[] {
  const result: T[] = [];
  for (const id of player.allies) { const ally = players.get(id); if (id !== player.id && ally?.allies.has(player.id)) result.push(ally); }
  return result;
}
export function coalitionAttackMult(player: DomainPlayer | undefined, defenderId: string | undefined, players: ReadonlyMap<string, DomainPlayer>, now: number): number {
  if (!player || !defenderId || (player.afcCampaign?.wars?.[defenderId] ?? 0) <= now) return 1;
  const mult = multiplicativeEffectForPlayer(player, "coalitionAttackMult");
  if (mult === 1) return 1;
  return mutualAfcAllies(player, players).some(ally => (ally.afcCampaign?.wars?.[defenderId] ?? 0) > now) ? mult : 1;
}
export function afcEnvoyBenefits(player: Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "allies">, players: ReadonlyMap<string, AfcAlliancePeer>): { allies: number; goldPerMinute: number; manpowerRegenPerMinute: number; manpowerCap: number } {
  const allies = mutualAfcAllies(player, players).length;
  return {
    allies,
    goldPerMinute: allies * additiveEffectForPlayer(player, "allianceGoldPerDay") / 1440,
    manpowerRegenPerMinute: allies * additiveEffectForPlayer(player, "allianceManpowerRegenPerMinute"),
    manpowerCap: allies * additiveEffectForPlayer(player, "allianceManpowerCapAdd")
  };
}

/** Actual accrual and its source row use the same computed Coin/min value. */
export function applyAfcEnvoyIncome<T extends { incomePerMinute: number; economyBreakdown: { GOLD: { sources: Array<{ label: string; amountPerMinute: number; count: number }> } } }>(snapshot: T, benefits: ReturnType<typeof afcEnvoyBenefits>): T {
  if (benefits.goldPerMinute > 0) {
    snapshot.incomePerMinute += benefits.goldPerMinute;
    snapshot.economyBreakdown.GOLD.sources.push({ label: "Envoy Accreditation", amountPerMinute: benefits.goldPerMinute, count: benefits.allies });
  }
  return snapshot;
}
