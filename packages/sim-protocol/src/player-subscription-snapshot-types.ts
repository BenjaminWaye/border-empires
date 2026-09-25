// Extracted from index.ts (500-line source budget, see AGENTS.md) to make
// room for new tile-overlay wire fields without growing that file further.

import type { ChosenTrickleResource, FrontierDecayKind, PlayerRespawnNotice, SlotResource, VisibilityState, WaypointWireStep } from "@border-empires/shared";
import type { ManpowerBreakdown, SimulationSeasonState, WorldStatusSnapshot } from "./index.js";

export type PlayerSubscriptionDock = {
  dockId: string;
  tileKey: string;
  pairedDockId: string;
  connectedDockIds?: string[];
  routeWaypointsByLinkedDockId?: Record<string, Array<{ x: number; y: number }>>;
};

export type PlayerSubscriptionSnapshot = {
  playerId: string;
  player?: {
    id: string;
    name?: string;
    gold: number;
    manpower: number;
    manpowerCap: number;
    manpowerRegenPerMinute?: number;
    logisticsThroughputPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    incomePerMinute: number;
    strategicResources: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    strategicProductionPerMinute: Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>;
    // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): global
    // per-resource supply/demand pool (§5.6 v1 scope) — the same numbers
    // hasFreeResourceSlots gates BUILD_STRUCTURE on server-side. Lets the
    // client check real slot availability for FOOD/TITANIUM/CRYSTAL/UMBRITE
    // instead of the retired stockpile amounts (§14.3).
    resourceSlots?: {
      supply: Record<SlotResource, number>;
      demand: Record<SlotResource, number>;
    };
    // §14.2: per-structure dormancy detail — which tile+field keys
    // ("x,y:fort"/"observatory"/"siegeOutpost"/"economicStructure") are
    // currently dormant, and which of their required resource(s) are short.
    // Feeds the client's greyed-out/"unpowered" structure indicator.
    dormantStructures?: Array<{ key: string; resources: SlotResource[] }>;
    economyBreakdown?: Record<string, unknown>;
    upkeepPerMinute?: { food: number; titanium: number; umbrite: number; crystal: number; gold: number };
    upkeepLastTick?: Record<string, unknown>;
    developmentProcessLimit: number;
    activeDevelopmentProcessCount: number;
    // Base MUSTER_MAX_TILES plus tech/domain/wonder bonuses -- how many
    // muster flags this player can have active at once. Lets the client
    // detect it's at its cap before attempting to auto-create a new flag.
    musterFlagLimit?: number;
    pendingSettlements: Array<{ x: number; y: number; startedAt: number; resolvesAt: number }>;
    autoSettlementQueue?: Array<{ x: number; y: number }>;
    // Server-durable dev/expand queue tail (see runtime-dev-queue.ts /
    // runtime-waypoint-queue.ts): drains on its own while the player is
    // disconnected, capped at DEV_QUEUE_SERVER_CAP each. Not restart-durable
    // (in-memory only, see PlayerRuntimeSummary) -- only survives the running
    // process's lifetime, not a process restart.
    devQueue?: Array<{ tileKey: string; x: number; y: number; kind: "SETTLE" | "BUILD"; structureType?: string; queuedAt: number }>;
    // Matches WaypointQueueWireEntry (apps/simulation/src/player-runtime-summary.ts)
    // and ServerWaypointQueueWireEntry (packages/client's client-waypoint-
    // persistence.ts) -- steps/cursor/planId/plannedAt/stalled carry the
    // client-planned route and offline-replay position (see
    // docs/waypoint-client-planning-plan.md). Keep all three in sync.
    waypointQueue?: Array<{
      x: number;
      y: number;
      trackBarbarian?: boolean;
      queuedAt: number;
      planId?: string;
      plannedAt?: number;
      steps?: WaypointWireStep[];
      cursor?: number;
      stalled?: boolean;
    }>;
    techIds: string[];
    domainIds: string[];
    // Empire-wide Titanium/Umbrite Weapons Factory counts, sourced from the
    // runtime's authoritative ownedStructureCountByPlayerByType index (see
    // runtime-owned-structure-index.ts) — the same vision-independent count
    // combat itself trusts (runtime-weapons-factory-mults.ts). Lets any
    // consumer (e.g. the gateway's attack preview) look a player's factories
    // up as an O(1) field read instead of re-scanning that player's tiles.
    weaponsFactoryCounts?: { titanium: number; umbrite: number };
    // Locked sub-choice for domains that ask the player to pick a resource
    // (Clockwork Stipend). Persisted with the player snapshot so the choice
    // survives reconnects and snapshot replays. Narrow type comes from
    // @border-empires/shared so client and sim can't drift on which keys
    // count as valid trickle picks.
    chosenTrickleResource?: ChosenTrickleResource;
    // Emperor-endorsement bonus (galaxy meta-layer Phase 1): remaining
    // Imperial Ward activations. The active 10-minute invulnerability window
    // itself is communicated via a one-off IMPERIAL_WARD_ACTIVATED player
    // message, not this snapshot field (same convention as Aegis Lock).
    imperialWardCharges?: number;
    // Quickforge wonder: ms timestamp of this player's last discounted
    // rush-buy (0/absent = never used this UTC day). Sent purely so the
    // client's rush-buy price preview can replicate the server's exact
    // once-per-UTC-day discount gate (quickforgeAdjustedRushPrice in
    // @border-empires/shared) — the server remains authoritative on price.
    wonderLastFreeRushBuyAt?: number;
    // Galactic meta-layer v0 (docs/galactic-campaign-design.md §5, §12): a
    // one-time Wonder-style starting bonus granted to the most recent
    // season's Planet winner (§3) for their next season — a manpower-regen
    // head start (Dyson Array stand-in) and a vision-radius bump (Deep
    // Sensor Array stand-in). Consumed/set once at their first spawn; not a
    // recurring economy (v0 has no Production/Influence/Senate yet).
    galacticWonderManpowerRegenBonusPerMinute?: number;
    galacticWonderVisionRadiusBonus?: number;
    // §20: durable "what happened while I was away" feed — distinct from the
    // ephemeral PLAYER_MESSAGE toast. Most-recent-last on the wire (matches
    // the server's append order); the client reverses for most-recent-first
    // display. type is a free string, not a union, so new event types the
    // server adds don't require a client-protocol version bump to deliver —
    // an unrecognized type just falls back to a generic icon client-side.
    eventLog?: Array<{ id: string; type: string; text: string; occurredAt: number; x?: number; y?: number }>;
    mods?: Record<"attack" | "defense" | "income" | "vision", number>;
    modBreakdown?: Record<"attack" | "defense" | "income" | "vision", Array<{ label: string; mult: number }>>;
  };
  worldStatus?: WorldStatusSnapshot;
  season?: SimulationSeasonState;
  docks?: PlayerSubscriptionDock[];
  respawnNotice?: PlayerRespawnNotice;
  tiles: Array<{
    x: number;
    y: number;
    terrain?: "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" | undefined;
    resource?: string | undefined;
    prospectSignature?: "BLACKWOOD_CANOPY" | "FERROUS_DUST" | "REFRACTIVE_GROUND";
    dockId?: string | undefined;
    ownerId?: string | undefined;
    ownershipState?: string | undefined;
    /** Persistent-border reach owner (Runtime.reachBorder), independent of ownerId — see runtime-types.ts's SimulationTileWireDelta.reachOwnerId doc comment. */
    reachOwnerId?: string | undefined;
    frontierDecayAt?: number | undefined;
    frontierDecayKind?: FrontierDecayKind | undefined;
    breachShockUntil?: number | undefined;
    townJson?: string | undefined;
    townType?: "MARKET" | "FARMING";
    townName?: string | undefined;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
    fortJson?: string | undefined;
    observatoryJson?: string | undefined;
    siegeOutpostJson?: string | undefined;
    economicStructureJson?: string | undefined;
    sabotageJson?: string | undefined;
    shardSiteJson?: string | undefined;
    naturalWonderJson?: string | undefined;
    watchtowerJson?: string | undefined;
    waystationJson?: string | undefined;
    musterJson?: string | undefined;
    /** Automated Fabrication Complex (Phase 6, docs/manifest-tree-mapping-plan.md). */
    afcJson?: string | undefined;
    /** Fog-of-war authority tag — see VisibilityState in @border-empires/shared. */
    visibilityState?: VisibilityState | undefined;
    yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> } | undefined;
    yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
    // Broadcast-only ghost-ownership cleanup marker (see
    // tile-delta-visibility-filter.ts). Rides on a delta only; never a
    // persisted tile field. applyTileDeltasToSnapshot uses it to avoid
    // inserting phantom non-visible tiles into the cached snapshot.
    ownershipClearOnly?: boolean | undefined;
  }>;
};
