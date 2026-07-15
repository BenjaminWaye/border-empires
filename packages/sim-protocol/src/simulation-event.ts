import type { VisibilityState } from "@border-empires/shared";
import type { FrontierCombatActionType, LockedFrontierCombatResult, StrategicResourceKey } from "./index.js";

// Extracted from index.ts (which is already over the file-line cap and may
// not grow) so new event variants have somewhere to land without needing an
// unrelated trim elsewhere in that file every time.
export type SimulationEvent =
  | {
      eventType: "COMMAND_ACCEPTED";
      commandId: string;
      playerId: string;
      actionType: FrontierCombatActionType;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      resolvesAt: number;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "COMMAND_REJECTED";
      commandId: string;
      playerId: string;
      code: string;
      message: string;
    }
  | {
      // See command-event-lifecycle.ts for the full rationale.
      eventType: "COMMAND_RESOLVED";
      commandId: string;
      playerId: string;
    }
  | {
      eventType: "COMBAT_CANCELLED";
      commandId: string;
      playerId: string;
      count: number;
      cancelledCommandIds?: string[];
    }
  | {
      eventType: "COMBAT_RESOLVED";
      commandId: string;
      playerId: string;
      actionType: FrontierCombatActionType;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      attackerWon: boolean;
      manpowerDelta?: number;
      pillagedGold?: number;
      pillagedStrategic?: Partial<Record<StrategicResourceKey, number>>;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "COLLECT_RESULT";
      commandId: string;
      playerId: string;
      mode: "visible" | "tile";
      x?: number;
      y?: number;
      tiles: number;
      gold: number;
      strategic: Partial<Record<StrategicResourceKey, number>>;
    }
  | {
      eventType: "TILE_DELTA_BATCH";
      commandId: string;
      playerId: string;
      goldCost?: number;
      playerManpower?: number;
      tileDeltas: Array<{
        x: number;
        y: number;
        terrain?: "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" | undefined;
        resource?: string | undefined;
        dockId?: string | undefined;
        ownerId?: string | undefined;
        ownershipState?: string | undefined;
        frontierDecayAt?: number | undefined;
        frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
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
        musterJson?: string | undefined;
        /** Fog-of-war authority tag — see VisibilityState in @border-empires/shared. */
        visibilityState?: VisibilityState | undefined;
        yield?: { gold?: number; strategic?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldCap?: { gold: number; strategicEach: number } | undefined;
        ownershipClearOnly?: boolean | undefined;
      }>;
    }
  | {
      eventType: "TILE_YIELD_ANCHOR_UPDATED";
      commandId: string;
      playerId: string;
      tileKey: string;
      collectedAt: number;
    }
  | {
      // Batched form for upkeep accrual: at non-trivial empire sizes the
      // per-tile UPDATED variant emits dozens-to-hundreds of events per
      // upkeep tick, each becoming a separate SQLite appendEvent. That
      // queue backlog has been observed to block the main event loop for
      // 25s+ at only ~2,000 owned tiles (well under 1% of the 450x450
      // map). Single batch event = single appendEvent.
      eventType: "TILE_YIELD_ANCHOR_BATCH";
      commandId: string;
      playerId: string;
      anchors: Array<{ tileKey: string; collectedAt: number }>;
    }
  | {
      eventType: "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED";
      commandId: string;
      playerId: string;
      collectedAt: number;
    }
  | {
      eventType: "SETTLEMENT_STARTED";
      commandId: string;
      playerId: string;
      tileKey: string;
      startedAt: number;
      resolvesAt: number;
      goldCost: number;
    }
  | {
      eventType: "TECH_UPDATE";
      commandId: string;
      playerId: string;
      payloadJson: string;
    }
  | {
      eventType: "DOMAIN_UPDATE";
      commandId: string;
      playerId: string;
      payloadJson: string;
    }
  | {
      eventType: "PLAYER_MESSAGE";
      commandId: string;
      playerId: string;
      messageType: string;
      payloadJson: string;
    }
  | {
      /** Barbarian ate a non-barb player tile (gain > 0) but did not multiply —
       *  either progress below threshold or population cap blocking. */
      eventType: "BARB_ATE_TILE";
      commandId: string;
      playerId: string;
      originKey: string;
      targetKey: string;
      eatenOwnerId: string;
      eatenResource: string | null;
      eatenHasTown: boolean;
      gain: number;
      sourceProgress: number;
      newProgress: number;
      capBlocked: boolean;
    }
  | {
      /** Barbarian multiplied: origin tile kept, target tile also kept, net +1. */
      eventType: "BARB_MULTIPLIED";
      commandId: string;
      playerId: string;
      originKey: string;
      targetKey: string;
      eatenOwnerId: string | null;
      eatenResource: string | null;
      eatenHasTown: boolean;
      gain: number;
      sourceProgress: number;
      barbTileCount: number;
    };
