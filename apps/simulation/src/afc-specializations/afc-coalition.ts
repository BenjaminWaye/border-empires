import type { DomainPlayer } from "@border-empires/game-domain";
import { AFC_SPECIALIZATION_BALANCE } from "@border-empires/shared";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

export { afcCampaignGuardCounters, afcCampaignStateGauges } from "./afc-diagnostics.js";

export interface AfcAlliancePeer { id: string; allies: ReadonlySet<string> }
export function mutualAfcAllies<T extends AfcAlliancePeer>(player: AfcAlliancePeer, players: ReadonlyMap<string, T>): T[] {
  const result: T[] = [];
  for (const id of player.allies) { const ally = players.get(id); if (id !== player.id && !id.startsWith("barbarian-") && ally?.allies.has(player.id)) result.push(ally); }
  return result;
}
type AgreementPeer = AfcAlliancePeer & { truces?: ReadonlySet<string> | undefined };
/** Distinct Houses this player holds a mutual alliance or an active truce with (Court armistices included). */
export function afcAgreementCount(player: AgreementPeer, players: ReadonlyMap<string, AfcAlliancePeer>): number {
  const partners = new Set(mutualAfcAllies(player, players).map(ally => ally.id));
  for (const id of player.truces ?? []) if (id !== player.id && !id.startsWith("barbarian-") && players.has(id)) partners.add(id);
  return partners.size;
}
/** Envoy Accreditation: share of the player's own Coin income added per agreement, capped. */
export function afcEnvoyIncomeShare(player: Pick<DomainPlayer, "techIds" | "domainIds"> & AgreementPeer, players: ReadonlyMap<string, AfcAlliancePeer>): { share: number; agreements: number } {
  const perAgreement = additiveEffectForPlayer(player, "truceIncomeShare");
  if (perAgreement <= 0) return { share: 0, agreements: 0 };
  const agreements = afcAgreementCount(player, players);
  return { share: Math.min(AFC_SPECIALIZATION_BALANCE.truceIncomeShareMax, perAgreement * agreements), agreements };
}
/** Allied Levies: share of the player's own manpower cap and regeneration added per mutual ally, capped by ally count. */
export function afcAlliedLevyShare(player: Pick<DomainPlayer, "techIds" | "domainIds"> & AfcAlliancePeer, players: ReadonlyMap<string, AfcAlliancePeer>): { share: number; allies: number } {
  const perAlly = additiveEffectForPlayer(player, "alliedLevyShare");
  if (perAlly <= 0) return { share: 0, allies: 0 };
  const allies = Math.min(AFC_SPECIALIZATION_BALANCE.alliedLevyMaxAllies, mutualAfcAllies(player, players).length);
  return { share: perAlly * allies, allies };
}

export const AFC_ENVOY_SOURCE_LABEL = "Envoy Accreditation";
export const AFC_LEVY_SOURCE_LABEL = "Allied Levies";
export function afcEnvoyIncomeInSnapshot(snapshot: { economyBreakdown?: { GOLD: { sources: readonly { label: string; amountPerMinute: number }[] } } }): number {
  return snapshot.economyBreakdown?.GOLD.sources.find(row => row.label === AFC_ENVOY_SOURCE_LABEL)?.amountPerMinute ?? 0;
}

/** Actual accrual and its source row use the same computed Coin/min value. */
export function applyAfcEnvoyIncome<T extends { incomePerMinute: number; economyBreakdown: { GOLD: { sources: Array<{ label: string; amountPerMinute: number; count: number }> } } }>(snapshot: T, goldPerMinute: number, agreements: number): T {
  if (goldPerMinute > 0) {
    snapshot.incomePerMinute += goldPerMinute;
    snapshot.economyBreakdown.GOLD.sources.push({ label: AFC_ENVOY_SOURCE_LABEL, amountPerMinute: goldPerMinute, count: agreements });
  }
  return snapshot;
}
