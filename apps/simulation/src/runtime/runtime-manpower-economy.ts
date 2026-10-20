import { economyRelevantTileFieldsChanged } from "../runtime-economy-cache-invalidation.js";
import { LANDING_MANPOWER_RESERVE, MANPOWER_EPSILON } from "@border-empires/shared";
import type { ManpowerBreakdown } from "@border-empires/sim-protocol";
import type { DomainTileState } from "@border-empires/game-domain";
import type { RuntimePlayer } from "../runtime-types.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import type { ManpowerStructureBonus } from "../runtime-manpower-structure-bonus.js";
import { accrueManpower, effectiveManpowerAt as effectiveManpowerAtImpl, playerManpowerBreakdownFromSummary,
  playerManpowerCapFromSummary, playerManpowerRegenPerMinuteFromSummary } from "../runtime-manpower.js";
import { TITANIUM_LEVY_REGEN_FREEZE_KEY } from "../runtime-titanium-levy-command.js";
import { grantOverflowManpower, manpowerCeiling, settleWaystationManpowerOverflow } from "../runtime-manpower-ceiling.js";
import * as wonderEffects from "../runtime-natural-wonders.js";
import { afcEnvoyBenefits, mutualAfcAllies, type AfcEnvoyBenefits } from "../afc-specializations/afc-coalition.js";
import { multiplicativeEffectForPlayer, additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

export interface RuntimeManpowerEconomyContext {
  players?: ReadonlyMap<string, RuntimePlayer>;
  now: () => number;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  cachedManpowerStructureBonusForPlayer: (player: RuntimePlayer) => ManpowerStructureBonus;
  wonderCacheByPlayer: Map<string, Set<string>>;
  getAbilityCooldownUntil: (playerId: string, abilityKey: string) => number;
  applyEconomyAccrual: (player: RuntimePlayer, nowMs: number) => void;
}

function baseManpowerCap(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  if (player.id === "barbarian-1") return Number.MAX_SAFE_INTEGER;
  const { ancillaryDepotCount, reserveLatticeNetworkAncillaryDepotCount, ancillaryFactoryCapacityBonusByTown } = ctx.cachedManpowerStructureBonusForPlayer(player);
  return (
    playerManpowerCapFromSummary(ctx.summaryForPlayer(player.id), ancillaryFactoryCapacityBonusByTown ? 0 : ancillaryDepotCount, ancillaryFactoryCapacityBonusByTown ? 0 : reserveLatticeNetworkAncillaryDepotCount, ancillaryFactoryCapacityBonusByTown) +
    (wonderEffects.playerHasWonderType(ctx.wonderCacheByPlayer, player.id, "CONSCRIPTION_ENGINE") ? 2000 : 0)
  );
}

function baseManpowerRegenPerMinute(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  // The Iron Levy (tech-tree redesign): a 2-hour empire-wide manpower
  // regen freeze after triggering the muster ability.
  if (ctx.getAbilityCooldownUntil(player.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > ctx.now()) return 0;
  const { neuralWorksNetworkAncillaryFactoryCount, ancillaryFactoryCount, censusDirectorateManpowerBuildingCount } =
    ctx.cachedManpowerStructureBonusForPlayer(player);
  return playerManpowerRegenPerMinuteFromSummary(
    ctx.summaryForPlayer(player.id),
    neuralWorksNetworkAncillaryFactoryCount,
    ancillaryFactoryCount,
    censusDirectorateManpowerBuildingCount,
    player.galacticWonderManpowerRegenBonusPerMinute ?? 0
  );
}

function envoyManpowerBenefits(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): AfcEnvoyBenefits {
  if (!ctx.players) return { allies: 0, goldPerMinute: 0, manpowerCap: 0, manpowerRegenPerMinute: 0 };
  return afcEnvoyBenefits(player, ctx.players, ally => ({
    goldPerMinute: 0, manpowerCap: baseManpowerCap(ctx, ally),
    manpowerRegenPerMinute: baseManpowerRegenPerMinute(ctx, ally)
  }));
}

export function playerManpowerCap(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  return baseManpowerCap(ctx, player) + envoyManpowerBenefits(ctx, player).manpowerCap;
}

export function playerManpowerRegenPerMinute(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  if (ctx.getAbilityCooldownUntil(player.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > ctx.now()) return 0;
  return baseManpowerRegenPerMinute(ctx, player) + envoyManpowerBenefits(ctx, player).manpowerRegenPerMinute;
}

export function playerLogisticsThroughputPerMinute(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): number {
  // Logistics throughput = same as manpower regen for now; tune later.
  return playerManpowerRegenPerMinute(ctx, player) * multiplicativeEffectForPlayer(player, "logisticsThroughputMult");
}

export function playerManpowerBreakdown(ctx: RuntimeManpowerEconomyContext, player: RuntimePlayer): ManpowerBreakdown {
  const {
    ancillaryDepotCount,
    reserveLatticeNetworkAncillaryDepotCount,
    neuralWorksNetworkAncillaryFactoryCount,
    ancillaryFactoryCount,
    censusDirectorateManpowerBuildingCount,
    ancillaryFactoryCapacityBonusByTown
  } = ctx.cachedManpowerStructureBonusForPlayer(player);
  const breakdown = playerManpowerBreakdownFromSummary(
    ctx.summaryForPlayer(player.id),
    ancillaryFactoryCapacityBonusByTown ? 0 : ancillaryDepotCount,
    ancillaryFactoryCapacityBonusByTown ? 0 : reserveLatticeNetworkAncillaryDepotCount,
    neuralWorksNetworkAncillaryFactoryCount,
    ancillaryFactoryCount,
    censusDirectorateManpowerBuildingCount,
    player.galacticWonderManpowerRegenBonusPerMinute ?? 0,
    ancillaryFactoryCapacityBonusByTown
  );
  const envoy = envoyManpowerBenefits(ctx, player);
  if (envoy?.manpowerCap) breakdown.cap.push({ label: "Envoy Accreditation", amount: envoy.manpowerCap });
  if (envoy?.manpowerRegenPerMinute) breakdown.regen.push({ label: "Envoy Accreditation", amount: ctx.getAbilityCooldownUntil(player.id, TITANIUM_LEVY_REGEN_FREEZE_KEY) > ctx.now() ? 0 : envoy.manpowerRegenPerMinute });
  return breakdown;
}

export function effectiveManpowerAtForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): number {
  const cap = playerManpowerCap(ctx, player);
  return effectiveManpowerAtImpl(player, cap, playerManpowerRegenPerMinute(ctx, player), nowMs);
}

export function applyManpowerRegenForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): void {
  ctx.applyEconomyAccrual(player, nowMs);
  refreshManpowerOnlyForPlayer(ctx, player, nowMs);
}

// A player's first manpower settle is the start of their empire: a new human
// just joined, or an AI empire at season start (persisted players already
// carry manpowerUpdatedAt, so nobody existing gets it). Every new empire lands
// with the one-time LANDING_MANPOWER_RESERVE, allowed above the cap like a
// Waystation grant. landingReserveGranted is persisted and also set on records
// rebuilt from existing territory (runtime-gross-income-repair.ts), so it can
// never be granted twice. Barbarians are not empires (their cap is
// effectively unlimited -- see playerManpowerCap).
const grantLandingManpowerReserve = (player: RuntimePlayer, cap: number): void => {
  if (player.id.startsWith("barbarian-") || player.landingReserveGranted) return;
  grantOverflowManpower(player, LANDING_MANPOWER_RESERVE, cap);
  player.landingReserveGranted = true;
};

/**
 * Manpower-only variant of {@link applyManpowerRegenForPlayer} that skips the
 * economy-accrual side effect. The accrual is O(territory tiles) per call
 * (it sorts the player's territory tile keys for upkeep collection); doing
 * it per player on every planner-state export was the dominant source of
 * the recurring 1.4-2.0 s `sync_players_export` block on staging. Skipping
 * here is safe because the accrual still runs on every real command path
 * and on the periodic tick, so player gold/resources catch up within a
 * single planner cycle.
 */
export function refreshManpowerOnlyForPlayer(
  ctx: RuntimeManpowerEconomyContext,
  player: RuntimePlayer,
  nowMs: number
): void {
  const cap = playerManpowerCap(ctx, player);
  if (!Number.isFinite(player.manpower)) {
    player.manpower = cap;
    delete player.manpowerBanked;
    grantLandingManpowerReserve(player, cap);
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
  if (cap > previousCap) {
    player.manpower = Math.min(manpowerCeiling(player, cap), Math.max(0, player.manpower) + (cap - previousCap));
  }
  if (!Number.isFinite(player.manpowerUpdatedAt)) {
    player.manpower = Math.max(0, Math.min(manpowerCeiling(player, cap), player.manpower));
    grantLandingManpowerReserve(player, cap);
    settleWaystationManpowerOverflow(player, cap);
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
    return;
  }
  const { manpower, banked } = accrueManpower(player, cap, playerManpowerRegenPerMinute(ctx, player), nowMs);
  player.manpower = manpower;
  if (banked > MANPOWER_EPSILON) player.manpowerBanked = banked;
  else delete player.manpowerBanked;
  settleWaystationManpowerOverflow(player, cap);
  player.manpowerUpdatedAt = nowMs;
  player.manpowerCapSnapshot = cap;
}

/** Settle only direct Envoy dependents at the old rate before domestic capabilities change. */
export function settleEnvoyDependents(ctx: RuntimeManpowerEconomyContext, ownerIds: Iterable<string | undefined>, nowMs: number): void {
  if (!ctx.players) return;
  const settled = new Set<string>();
  for (const id of ownerIds) {
    const owner = id ? ctx.players.get(id) : undefined;
    if (!owner) continue;
    for (const ally of mutualAfcAllies(owner, ctx.players)) {
      if (settled.has(ally.id) || additiveEffectForPlayer(ally, "allianceContributionShare") <= 0) continue;
      if (ally.manpowerUpdatedAt !== undefined && ally.manpowerUpdatedAt >= nowMs) continue;
      settled.add(ally.id);
      refreshManpowerOnlyForPlayer(ctx, ally, nowMs);
    }
  }
}

export function settleEnvoyDependentsBeforeTileChange(ctx: RuntimeManpowerEconomyContext, previous: DomainTileState | undefined, next: DomainTileState): void {
  if (previous && !economyRelevantTileFieldsChanged(previous, next)) return;
  settleEnvoyDependents(ctx, [previous?.ownerId, next.ownerId], ctx.now());
}
