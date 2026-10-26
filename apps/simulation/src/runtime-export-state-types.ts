import type { ManpowerBreakdown, TileOverlayJsonFields } from "@border-empires/sim-protocol";
import type { FrontierCommandType, PlayerEventLogEntry } from "@border-empires/game-domain";
import type { AutoSettlePrefs, FrontierDecayKind, IslandNameClaim, ProspectSignature, Terrain } from "@border-empires/shared";
import type { StrategicResourceKey } from "./runtime-types.js";
import type { PendingSettlementRecord, WaypointQueueWireEntry } from "./player-runtime-summary.js";
import type { ExportedDevQueueEntry } from "./runtime-dev-queue-restore.js";

export type RuntimeExportState = {
  tiles: Array<{
    x: number;
    y: number;
    terrain: Terrain;
    resource?: string;
    prospectSignature?: ProspectSignature;
    dockId?: string;
    ownerId?: string;
    ownershipState?: string;
    /** Persistent-border reach owner (Runtime.reachBorder), independent of ownerId — see SimulationTileWireDelta.reachOwnerId. Populated only by the per-player visible-state export (runtime-visible-state.ts); the full-world export below does not currently source it. */
    reachOwnerId?: string;
    frontierDecayAt?: number;
    frontierDecayKind?: FrontierDecayKind;
    captureHoldUntil?: number;
    townJson?: string;
    townType?: "MARKET" | "FARMING";
    townName?: string;
    townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  } & TileOverlayJsonFields>;
  players: Array<{
    id: string;
    name?: string;
    points: number;
    manpower: number;
    manpowerCap?: number;
    manpowerRegenPerMinute?: number;
    logisticsThroughputPerMinute?: number;
    manpowerBreakdown?: ManpowerBreakdown;
    manpowerCapSnapshot?: number;
    techIds: string[];
    domainIds: string[];
    afcUpgradeRuleset?: "afc-v1";
  afcCoreTownKeys?: string[];
  afcScarcityFoodSlots?: number;
  afcCampaign?: import("@border-empires/shared").AfcCampaignState;
    strategicResources: Partial<Record<StrategicResourceKey, number>>;
    allies: string[];
    truces: string[];
    vision: number;
    visionRadiusBonus: number;
    incomeMultiplier?: number;
    ownedTownTileKeys: string[];
    settledTileCount?: number;
    townCount?: number;
    incomePerMinute?: number;
    afcEnvoyIncomePerMinute?: number;
    strategicProductionPerMinute?: Record<StrategicResourceKey, number>;
    activeDevelopmentProcessCount?: number;
    imperialWardCharges?: number;
    islandNames?: IslandNameClaim[];
    autoSettle?: AutoSettlePrefs;
    // Waystation activation's pooled resource-slot bump -- see
    // runtime-waystation-activation.ts's grantWaystationResourceSlotBonus.
    // Must round-trip through checkpoint/reconnect or a sim restart silently
    // and permanently wipes it (the tile's one-shot `activated` guard means
    // it can never be re-granted).
    waystationResourceSlotBonus?: Partial<Record<StrategicResourceKey, number>>;
    // Quickforge wonder: ms timestamp of this player's last discounted
    // rush-buy (0/absent = never used). Sent to the client purely so the
    // rush-buy price preview (client-tile-menu-view.ts) can replicate the
    // exact UTC-day gate quickforgeAdjustedRushPrice enforces server-side —
    // the server remains authoritative on the actual charged price.
    wonderLastFreeRushBuyAt?: number;
    // WARPRESS wonder's +1 muster-flag slot -- see runtime-natural-wonders.ts
    // and player-snapshot.ts's musterFlagLimit.
    wonderMusterExtraFlag?: number;
    relicDevelopmentBonus?: number;
    relicMapHints?: import("@border-empires/shared").RelicMapHint[];
    galacticWonderManpowerRegenBonusPerMinute?: number; // v0 Wonder stand-in (§5, §12) — see DomainPlayer.
    galacticWonderVisionRadiusBonus?: number;
    eventLog?: PlayerEventLogEntry[];
    // Server-durable dev/expand queue tail (see player-runtime-summary.ts /
    // runtime-dev-queue.ts / runtime-waypoint-queue.ts) -- carried through
    // exportState so player-snapshot.ts can seed a reconnecting/fresh-login
    // client with whatever survived while it was disconnected, the same way
    // emitPlayerStateUpdate already does for the live PLAYER_UPDATE stream.
    // reservedManpower/reservedSlotRequirements MUST round-trip: the reserve
    // was already deducted from the persisted player.manpower above, so a
    // restore that dropped them would owe a refund it no longer knows about
    // and burn that manpower permanently (see runtime-dev-queue-restore.ts).
    devQueue?: ExportedDevQueueEntry[];
    waypointQueue?: WaypointQueueWireEntry[];
  }>;
  pendingSettlements: Array<PendingSettlementRecord>;
  activeLocks: Array<{
    commandId: string;
    playerId: string;
    actionType: FrontierCommandType;
    originKey: string;
    targetKey: string;
    resolvesAt: number;
    combatResolutionJson?: string;
  }>;
  docks: Array<{
    dockId: string;
    tileKey: string;
    pairedDockId: string;
    connectedDockIds?: readonly string[];
    routeWaypointsByLinkedDockId?: Readonly<Record<string, ReadonlyArray<{ x: number; y: number }>>>;
  }>;
  playerYieldCollectionEpochByPlayer: Array<{ playerId: string; collectedAt: number }>;
  terrainEpoch: number;
  /** Cumulative count of town growth ticks skipped due to insufficient food. */
  growthStalledNoFoodCounter?: number;
};
