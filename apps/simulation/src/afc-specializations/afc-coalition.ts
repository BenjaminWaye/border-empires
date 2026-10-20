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
export interface AfcEnvoyBaseStats { goldPerMinute: number; manpowerRegenPerMinute: number; manpowerCap: number }
export interface AfcEnvoyBenefits extends AfcEnvoyBaseStats { allies: number }

/** Resolve domestic rates only: an ally's Envoy contribution must never feed back into another. */
export function afcEnvoyBenefits<T extends AfcAlliancePeer>(
  player: Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "allies">,
  players: ReadonlyMap<string, T>,
  baseStatsForAlly: (ally: T) => AfcEnvoyBaseStats
): AfcEnvoyBenefits {
  const result = { allies: 0, goldPerMinute: 0, manpowerRegenPerMinute: 0, manpowerCap: 0 };
  const share = additiveEffectForPlayer(player, "allianceContributionShare");
  if (share <= 0) return result;
  for (const ally of mutualAfcAllies(player, players)) {
    if (ally.id.startsWith("barbarian-")) continue;
    const base = baseStatsForAlly(ally);
    result.allies++;
    for (const key of ["goldPerMinute", "manpowerRegenPerMinute", "manpowerCap"] as const) {
      if (Number.isFinite(base[key])) result[key] += Math.max(0, base[key]) * share;
    }
  }
  return result;
}

export const AFC_ENVOY_SOURCE_LABEL = "Envoy Accreditation";
export function afcEnvoyIncomeInSnapshot(snapshot: { economyBreakdown?: { GOLD: { sources: readonly { label: string; amountPerMinute: number }[] } } }): number {
  return snapshot.economyBreakdown?.GOLD.sources.find(row => row.label === AFC_ENVOY_SOURCE_LABEL)?.amountPerMinute ?? 0;
}

/** Actual accrual and its source row use the same computed Coin/min value. */
export function applyAfcEnvoyIncome<T extends { incomePerMinute: number; economyBreakdown: { GOLD: { sources: Array<{ label: string; amountPerMinute: number; count: number }> } } }>(snapshot: T, benefits: AfcEnvoyBenefits): T {
  if (benefits.goldPerMinute > 0) {
    snapshot.incomePerMinute += benefits.goldPerMinute;
    snapshot.economyBreakdown.GOLD.sources.push({ label: AFC_ENVOY_SOURCE_LABEL, amountPerMinute: benefits.goldPerMinute, count: benefits.allies });
  }
  return snapshot;
}
