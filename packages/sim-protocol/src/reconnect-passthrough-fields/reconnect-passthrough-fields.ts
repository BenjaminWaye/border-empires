// The reconnect/init-payload counterpart to subscription-snapshot-merge.ts's
// PLAYER_MERGE_RULES: apps/realtime-gateway/src/init-payload/init-payload.ts
// builds the payload a client receives on first connect/reconnect, and used
// to carry PlayerSubscriptionSnapshot["player"]'s pure-passthrough fields
// (no legacy/bootstrap fallback, just "copy through if the live snapshot has
// it") through three separate hand-maintained mechanisms: inline conditional
// spreads, one crammed onto a single line (devQueue/waypointQueue, added as
// a drive-by fix for PR #1640 without ever joining a real allowlist type),
// and init-payload-reconnect-fields.ts's own separate allowlist (eventLog/
// logisticsThroughputPerMinute/imperialWardCharges/wonderLastFreeRushBuyAt).
// None of those three were tied to PlayerStateSnapshot's field list by the
// compiler -- exactly the drift shape that caused every incident this file
// and subscription-snapshot-merge.ts exist to prevent (see
// docs/player-wire-refactor-plan.md and its Phase 3 plan).
//
// RECONNECT_PASSTHROUGH_FIELDS is a `satisfies Record<keyof
// PlayerStateSnapshot, ...>` table, same shape and purpose as
// PLAYER_MERGE_RULES: a field added to PlayerStateSnapshot without an entry
// here fails to compile. Every field falls into one of two buckets:
//  - "passthrough": carry the live snapshot's value through if present, no
//    fallback -- these are the only fields this module actually returns.
//  - "handledInline": this field has real legacy/bootstrap fallback
//    semantics (different per field -- some fall back to a bootstrap
//    profile, some to a hardcoded default, some to a legacy pre-rewrite
//    player object) and is intentionally built by hand in init-payload.ts's
//    player object literal, not mechanically here. Still listed (rather
//    than omitted) so the exhaustiveness check covers it -- a field that's
//    genuinely bespoke needs a marker saying so, not silent absence a
//    future reader can't tell apart from an oversight.
import type { PlayerStateSnapshot } from "../subscription-snapshot-merge/subscription-snapshot-merge.js";

type PassthroughEntry =
  | { kind: "passthrough"; extract: (p: PlayerStateSnapshot) => Partial<PlayerStateSnapshot> | undefined }
  | { kind: "handledInline" };

const numberField = <K extends keyof PlayerStateSnapshot>(key: K): PassthroughEntry => ({
  kind: "passthrough",
  extract: (p) => (typeof p[key] === "number" ? ({ [key]: p[key] } as Partial<PlayerStateSnapshot>) : undefined)
});

const presentField = <K extends keyof PlayerStateSnapshot>(key: K): PassthroughEntry => ({
  kind: "passthrough",
  extract: (p) => (p[key] !== undefined ? ({ [key]: p[key] } as Partial<PlayerStateSnapshot>) : undefined)
});

export const RECONNECT_PASSTHROUGH_FIELDS = {
  // Legacy/bootstrap-fallback fields -- built by hand in init-payload.ts.
  id: { kind: "handledInline" },
  name: { kind: "handledInline" },
  gold: { kind: "handledInline" },
  manpower: { kind: "handledInline" },
  manpowerCap: { kind: "handledInline" },
  manpowerRegenPerMinute: { kind: "handledInline" },
  manpowerBreakdown: { kind: "handledInline" },
  incomePerMinute: { kind: "handledInline" },
  strategicResources: { kind: "handledInline" },
  strategicProductionPerMinute: { kind: "handledInline" },
  resourceSlots: { kind: "handledInline" },
  // Defaults to [] inline (same legacy-bootstrap caveat as resourceSlots
  // above), so it's handled alongside it rather than through the mechanical
  // passthrough spread -- being in that spread too would silently double-set
  // it every reconnect (harmless only by coincidence, since both paths
  // currently compute the same value).
  dormantStructures: { kind: "handledInline" },
  upkeepPerMinute: { kind: "handledInline" },
  techIds: { kind: "handledInline" },
  domainIds: { kind: "handledInline" },
  chosenTrickleResource: { kind: "handledInline" },
  mods: { kind: "handledInline" },
  modBreakdown: { kind: "handledInline" },
  // Pure passthrough fields -- no legacy/bootstrap fallback exists for any
  // of these, so carrying the live snapshot's value through (or omitting it)
  // is the whole rule.
  economyBreakdown: presentField("economyBreakdown"),
  upkeepLastTick: presentField("upkeepLastTick"),
  // Uses the same typeof-number rule PLAYER_MERGE_RULES uses for this field
  // (rather than the truthy check init-payload.ts had inline, which treated
  // 0 as absent) so the two allowlists agree on what "present" means here.
  developmentProcessLimit: numberField("developmentProcessLimit"),
  activeDevelopmentProcessCount: numberField("activeDevelopmentProcessCount"),
  pendingSettlements: presentField("pendingSettlements"),
  autoSettlementQueue: presentField("autoSettlementQueue"),
  devQueue: presentField("devQueue"),
  waypointQueue: presentField("waypointQueue"),
  eventLog: presentField("eventLog"),
  logisticsThroughputPerMinute: numberField("logisticsThroughputPerMinute"),
  imperialWardCharges: numberField("imperialWardCharges"),
  wonderLastFreeRushBuyAt: numberField("wonderLastFreeRushBuyAt"),
  // Confirmed missing from init-payload.ts entirely until this fix (see
  // docs/player-wire-refactor-plan-phase3.md): real, durable player state
  // (granted once at spawn to the previous season's Planet winner, read
  // back off the player by runtime-manpower.ts/tech-domain-bridge.ts) that
  // never made it into the reconnect/init payload, so a season-winner
  // bonus silently vanished from the client on any reconnect.
  galacticWonderManpowerRegenBonusPerMinute: numberField("galacticWonderManpowerRegenBonusPerMinute"),
  galacticWonderVisionRadiusBonus: numberField("galacticWonderVisionRadiusBonus"),
  // Cheap authoritative Titanium/Umbrite Weapons Factory counts (see
  // player-snapshot.ts) -- no legacy/bootstrap fallback, plain passthrough.
  weaponsFactoryCounts: presentField("weaponsFactoryCounts")
} as const satisfies Record<keyof PlayerStateSnapshot, PassthroughEntry>;

export type ReconnectPassthroughFields = Partial<PlayerStateSnapshot>;

export const reconnectPassthroughFields = (
  liveSnapshotPlayer: PlayerStateSnapshot | undefined
): ReconnectPassthroughFields => {
  if (!liveSnapshotPlayer) return {};
  let combined: ReconnectPassthroughFields = {};
  for (const entry of Object.values(RECONNECT_PASSTHROUGH_FIELDS)) {
    if (entry.kind !== "passthrough") continue;
    const patch = entry.extract(liveSnapshotPlayer);
    if (patch) combined = { ...combined, ...patch };
  }
  return combined;
};
