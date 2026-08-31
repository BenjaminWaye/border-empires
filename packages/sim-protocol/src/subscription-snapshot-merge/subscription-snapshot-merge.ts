// Merges a live PLAYER_MESSAGE/TECH_UPDATE/DOMAIN_UPDATE/GLOBAL_STATUS_UPDATE
// event onto a cached PlayerSubscriptionSnapshot, in place of a full re-export
// -- shared by two independent consumers:
//   - apps/simulation's own per-player snapshotCache (player-snapshot-cache.ts),
//     used to serve a fast bootstrap/reconnect subscribe, reachable even
//     while a player is offline (see applyNonTileEventToCache in
//     simulation-service.ts).
//   - apps/realtime-gateway's per-connection playerSubscriptions cache
//     (player-subscriptions.ts), used to keep an open connection's own
//     snapshot current between full rebuilds.
//
// This used to be two field-by-field-identical copies of the same function
// (apps/simulation/src/subscription-snapshot-cache/ and apps/realtime-
// gateway/src/subscription-snapshot-sync/) that had already drifted once --
// economyBreakdown/upkeepPerMinute/upkeepLastTick/storageCap/seasonWinner
// merged by the sim copy but dropped by the gateway copy; chosenTrickleResource
// merged by the gateway copy but dropped by the sim copy; devQueue/waypointQueue
// dropped by both for a while (see docs/player-wire-refactor-plan.md) --
// each drift silently discarding a field an
// active PLAYER_UPDATE push was already carrying, discoverable only via a
// live reconnect bug report. This lives in packages/sim-protocol (rather than
// packages/shared) because it needs PlayerSubscriptionSnapshot, and shared has
// no dependency on sim-protocol; both apps already depend on sim-protocol
// directly.
//
// PLAYER_MERGE_RULES below is the fix for the drift mechanism, not just the
// symptom: it's a `satisfies Record<keyof PlayerStateSnapshot, ...>` table,
// one rule per field on PlayerSubscriptionSnapshot["player"]. Add a field to
// that type without adding a rule here and this file fails to compile --
// the previous conditional-spread style let a field-by-field allowlist grow
// silently incomplete with no compiler signal at all.
import { isChosenTrickleResource } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot, SeasonWinnerSnapshot } from "../index.js";

export type TileDelta = NonNullable<PlayerSubscriptionSnapshot["tiles"][number]>;
export type WorldStatusSnapshot = NonNullable<PlayerSubscriptionSnapshot["worldStatus"]>;
export type PlayerStateSnapshot = NonNullable<PlayerSubscriptionSnapshot["player"]>;

// One merge rule per PlayerStateSnapshot field: given the untyped incoming
// payload, return the patch to apply (a single-key object) or undefined to
// leave the field untouched. A rule that always returns undefined (id, name,
// ...) is still required -- it documents "this field is never live-patched",
// distinguishing a deliberate choice from an omission the next reader can't
// tell apart from a bug.
type PlayerMergeRule = (payload: Record<string, unknown>) => Partial<PlayerStateSnapshot> | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const PLAYER_MERGE_RULES = {
  // Identity fields: set once at snapshot build time, never live-patched.
  id: () => undefined,
  name: () => undefined,
  gold: (p) => (typeof p.gold === "number" ? { gold: p.gold } : undefined),
  manpower: (p) => (typeof p.manpower === "number" ? { manpower: p.manpower } : undefined),
  manpowerCap: (p) => (typeof p.manpowerCap === "number" ? { manpowerCap: p.manpowerCap } : undefined),
  manpowerRegenPerMinute: (p) =>
    typeof p.manpowerRegenPerMinute === "number" ? { manpowerRegenPerMinute: p.manpowerRegenPerMinute } : undefined,
  logisticsThroughputPerMinute: (p) =>
    typeof p.logisticsThroughputPerMinute === "number"
      ? { logisticsThroughputPerMinute: p.logisticsThroughputPerMinute }
      : undefined,
  manpowerBreakdown: (p) =>
    isRecord(p.manpowerBreakdown) ? { manpowerBreakdown: p.manpowerBreakdown as NonNullable<PlayerStateSnapshot["manpowerBreakdown"]> } : undefined,
  incomePerMinute: (p) => (typeof p.incomePerMinute === "number" ? { incomePerMinute: p.incomePerMinute } : undefined),
  strategicResources: (p) =>
    isRecord(p.strategicResources) ? { strategicResources: p.strategicResources as PlayerStateSnapshot["strategicResources"] } : undefined,
  strategicProductionPerMinute: (p) =>
    isRecord(p.strategicProductionPerMinute)
      ? { strategicProductionPerMinute: p.strategicProductionPerMinute as PlayerStateSnapshot["strategicProductionPerMinute"] }
      : undefined,
  resourceSlots: (p) =>
    isRecord(p.resourceSlots) ? { resourceSlots: p.resourceSlots as NonNullable<PlayerStateSnapshot["resourceSlots"]> } : undefined,
  dormantStructures: (p) =>
    Array.isArray(p.dormantStructures)
      ? { dormantStructures: p.dormantStructures as NonNullable<PlayerStateSnapshot["dormantStructures"]> }
      : undefined,
  economyBreakdown: (p) => (isRecord(p.economyBreakdown) ? { economyBreakdown: p.economyBreakdown } : undefined),
  upkeepPerMinute: (p) =>
    isRecord(p.upkeepPerMinute) ? { upkeepPerMinute: p.upkeepPerMinute as NonNullable<PlayerStateSnapshot["upkeepPerMinute"]> } : undefined,
  upkeepLastTick: (p) => (isRecord(p.upkeepLastTick) ? { upkeepLastTick: p.upkeepLastTick } : undefined),
  developmentProcessLimit: (p) =>
    typeof p.developmentProcessLimit === "number" ? { developmentProcessLimit: p.developmentProcessLimit } : undefined,
  activeDevelopmentProcessCount: (p) =>
    typeof p.activeDevelopmentProcessCount === "number" ? { activeDevelopmentProcessCount: p.activeDevelopmentProcessCount } : undefined,
  pendingSettlements: (p) =>
    Array.isArray(p.pendingSettlements) ? { pendingSettlements: p.pendingSettlements as PlayerStateSnapshot["pendingSettlements"] } : undefined,
  autoSettlementQueue: (p) =>
    Array.isArray(p.autoSettlementQueue)
      ? { autoSettlementQueue: p.autoSettlementQueue as NonNullable<PlayerStateSnapshot["autoSettlementQueue"]> }
      : undefined,
  devQueue: (p) => (Array.isArray(p.devQueue) ? { devQueue: p.devQueue as NonNullable<PlayerStateSnapshot["devQueue"]> } : undefined),
  waypointQueue: (p) =>
    Array.isArray(p.waypointQueue) ? { waypointQueue: p.waypointQueue as NonNullable<PlayerStateSnapshot["waypointQueue"]> } : undefined,
  // §20: durable per-player event log. Sent in full (not diffed) on every
  // PLAYER_UPDATE (see emitPlayerStateUpdate) -- was silently dropped by
  // both merge copies until this fix, identical shape to the devQueue/
  // waypointQueue bug this whole module exists to prevent recurring.
  eventLog: (p) => (Array.isArray(p.eventLog) ? { eventLog: p.eventLog as NonNullable<PlayerStateSnapshot["eventLog"]> } : undefined),
  // Progression fields: pushed on both PLAYER_UPDATE and TECH_UPDATE/
  // DOMAIN_UPDATE, so these five share one rule reused by both branches
  // below rather than being listed twice.
  techIds: (p) => (Array.isArray(p.techIds) ? { techIds: p.techIds as string[] } : undefined),
  domainIds: (p) => (Array.isArray(p.domainIds) ? { domainIds: p.domainIds as string[] } : undefined),
  chosenTrickleResource: (p) => (isChosenTrickleResource(p.chosenTrickleResource) ? { chosenTrickleResource: p.chosenTrickleResource } : undefined),
  mods: (p) => (isRecord(p.mods) ? { mods: p.mods as NonNullable<PlayerStateSnapshot["mods"]> } : undefined),
  modBreakdown: (p) => (isRecord(p.modBreakdown) ? { modBreakdown: p.modBreakdown as NonNullable<PlayerStateSnapshot["modBreakdown"]> } : undefined),
  // Not currently pushed via any live event -- reconnect-only today (see
  // @border-empires/sim-protocol's reconnect-passthrough-fields.ts and
  // docs/player-wire-refactor-plan.md). Listed (as no-ops) rather than
  // omitted for the same reason id/name are: a future PLAYER_UPDATE payload
  // that starts carrying one of these needs a single-line change here, not
  // a rediscovery of this whole class of bug.
  imperialWardCharges: () => undefined,
  wonderLastFreeRushBuyAt: () => undefined,
  galacticWonderManpowerRegenBonusPerMinute: () => undefined,
  galacticWonderVisionRadiusBonus: () => undefined
} as const satisfies Record<keyof PlayerStateSnapshot, PlayerMergeRule>;

// Fields PLAYER_MERGE_RULES also covers, but which TECH_UPDATE/DOMAIN_UPDATE
// carries only this small subset of -- everything else in the table (queues,
// manpower, resource slots, ...) doesn't change when a tech/domain is chosen.
const TECH_OR_DOMAIN_UPDATE_KEYS = ["gold", "strategicResources", "incomePerMinute", "techIds", "domainIds", "mods", "modBreakdown", "chosenTrickleResource"] as const satisfies ReadonlyArray<keyof typeof PLAYER_MERGE_RULES>;

const mergePlayerFields = (
  current: PlayerStateSnapshot,
  payload: Record<string, unknown>,
  keys: ReadonlyArray<keyof typeof PLAYER_MERGE_RULES>
): PlayerStateSnapshot => {
  let combinedPatch: Partial<PlayerStateSnapshot> | undefined;
  for (const key of keys) {
    const patch = PLAYER_MERGE_RULES[key](payload);
    if (patch) combinedPatch = combinedPatch ? { ...combinedPatch, ...patch } : patch;
  }
  return combinedPatch ? { ...current, ...combinedPatch } : current;
};

const ALL_PLAYER_MERGE_KEYS = Object.keys(PLAYER_MERGE_RULES) as ReadonlyArray<keyof typeof PLAYER_MERGE_RULES>;

export const applyPlayerMessageToSnapshot = (
  snapshot: PlayerSubscriptionSnapshot,
  payload: Record<string, unknown>
): PlayerSubscriptionSnapshot => {
  if (payload.type === "GLOBAL_STATUS_UPDATE") {
    const previousWorldStatus = snapshot.worldStatus;
    const incomingSeasonWinner = payload.seasonWinner as SeasonWinnerSnapshot | undefined;
    const resolvedSeasonWinner = incomingSeasonWinner ?? previousWorldStatus?.seasonWinner;
    return {
      ...snapshot,
      worldStatus: {
        leaderboard:
          (payload.leaderboard as WorldStatusSnapshot["leaderboard"]) ??
          previousWorldStatus?.leaderboard ?? {
            overall: [],
            byTiles: [],
            byIncome: [],
            byTechs: []
          },
        seasonVictory:
          (payload.seasonVictory as WorldStatusSnapshot["seasonVictory"]) ??
          previousWorldStatus?.seasonVictory ??
          [],
        ...(resolvedSeasonWinner !== undefined ? { seasonWinner: resolvedSeasonWinner as SeasonWinnerSnapshot } : {})
      }
    };
  }

  if (payload.type === "PLAYER_UPDATE" && snapshot.player) {
    return { ...snapshot, player: mergePlayerFields(snapshot.player as PlayerStateSnapshot, payload, ALL_PLAYER_MERGE_KEYS) };
  }

  if ((payload.type === "TECH_UPDATE" || payload.type === "DOMAIN_UPDATE") && snapshot.player) {
    return { ...snapshot, player: mergePlayerFields(snapshot.player as PlayerStateSnapshot, payload, TECH_OR_DOMAIN_UPDATE_KEYS) };
  }

  return snapshot;
};
