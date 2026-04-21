// Re-export domain modules promoted into game-domain.
export * from "./server-game-constants.js";
export * from "./server-shared-types.js";
export * from "./server-worldgen-clusters.js";
export * from "./server-worldgen-docks.js";
export * from "./server-worldgen-shards.js";
export * from "./server-worldgen-terrain.js";
export * from "./server-worldgen-towns.js";
export * from "./town-names.js";

import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  BREAKTHROUGH_ATTACK_MANPOWER_COST,
  BREAKTHROUGH_ATTACK_MANPOWER_MIN,
  COMBAT_LOCK_MS,
  FRONTIER_CLAIM_MS,
  type Tile
} from "@border-empires/shared";

export type FrontierCommandType = "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK";
export type DomainStrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";

export type DomainPlayer = {
  id: string;
  isAi: boolean;
  name?: string;
  points: number;
  manpower: number;
  manpowerUpdatedAt?: number;
  manpowerCapSnapshot?: number;
  techIds: Set<string>;
  domainIds?: Set<string>;
  mods?: {
    attack: number;
    defense: number;
    income: number;
    vision: number;
  };
  techRootId?: string;
  tileColor?: string;
  allies: Set<string>;
  strategicResources?: Partial<Record<DomainStrategicResourceKey, number>>;
  strategicProductionPerMinute?: Partial<Record<DomainStrategicResourceKey, number>>;
};

export type DomainTileView = Pick<Tile, "x" | "y" | "terrain" | "ownerId" | "ownershipState">;

export type DomainTileState = {
  x: number;
  y: number;
  terrain: Tile["terrain"];
  resource?: Tile["resource"] | undefined;
  dockId?: string | undefined;
  shardSite?: { kind: "CACHE" | "FALL"; amount: number; expiresAt?: number | undefined } | undefined;
  ownerId?: string | undefined;
  ownershipState?: Tile["ownershipState"] | undefined;
  town?:
    | (Pick<NonNullable<Tile["town"]>, "type" | "populationTier"> &
        Partial<
          Pick<
            NonNullable<Tile["town"]>,
            | "name"
            | "baseGoldPerMinute"
            | "supportCurrent"
            | "supportMax"
            | "goldPerMinute"
            | "cap"
            | "isFed"
            | "population"
            | "maxPopulation"
            | "populationGrowthPerMinute"
            | "connectedTownCount"
            | "connectedTownBonus"
            | "connectedTownNames"
            | "goldIncomePausedReason"
            | "manpowerCurrent"
            | "manpowerCap"
            | "hasMarket"
            | "marketActive"
            | "hasGranary"
            | "granaryActive"
            | "hasBank"
            | "bankActive"
            | "foodUpkeepPerMinute"
            | "growthModifiers"
          >
        >)
    | undefined;
  fort?:
    | {
        ownerId: string;
        status: NonNullable<Tile["fort"]>["status"];
        completesAt?: number | undefined;
        disabledUntil?: number | undefined;
        previousStatus?: "active" | undefined;
      }
    | undefined;
  observatory?:
    | {
        ownerId: string;
        status: NonNullable<Tile["observatory"]>["status"];
        completesAt?: number | undefined;
        cooldownUntil?: number | undefined;
        previousStatus?: "active" | "inactive" | undefined;
      }
    | undefined;
  siegeOutpost?:
    | {
        ownerId: string;
        status: NonNullable<Tile["siegeOutpost"]>["status"];
        completesAt?: number | undefined;
        previousStatus?: "active" | undefined;
      }
    | undefined;
  economicStructure?:
    | {
        ownerId: string;
        type: NonNullable<Tile["economicStructure"]>["type"];
        status: NonNullable<Tile["economicStructure"]>["status"];
        completesAt?: number | undefined;
        disabledUntil?: number | undefined;
        nextUpkeepAt?: number | undefined;
        inactiveReason?: NonNullable<Tile["economicStructure"]>["inactiveReason"] | undefined;
        previousStatus?: "active" | "inactive" | undefined;
      }
    | undefined;
  sabotage?:
    | {
        ownerId: string;
        endsAt: number;
        outputMultiplier: number;
      }
    | undefined;
};

export type ValidateFrontierCommandInput = {
  now: number;
  actor: DomainPlayer;
  actionType: FrontierCommandType;
  from: DomainTileState;
  to: DomainTileState;
  originLockedUntil?: number | undefined;
  originLockOwnerId?: string | undefined;
  targetLockedUntil?: number | undefined;
  targetLockOwnerId?: string | undefined;
  actionGoldCost: number;
  breakthroughGoldCost: number;
  breakthroughRequiredTechId: string;
  isAdjacent: boolean;
  isDockCrossing: boolean;
  isBridgeCrossing: boolean;
  targetShielded: boolean;
  defenderIsAlliedOrTruced: boolean;
};

export type ValidateFrontierCommandResult =
  | {
      ok: true;
      origin: { x: number; y: number };
      target: { x: number; y: number };
      resolvesAt: number;
      manpowerCost: number;
      manpowerMin: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
      cooldownRemainingMs?: number;
    };

const manpowerRequirements = (
  actionType: FrontierCommandType
): { manpowerMin: number; manpowerCost: number } => {
  if (actionType === "BREAKTHROUGH_ATTACK") {
    return {
      manpowerMin: BREAKTHROUGH_ATTACK_MANPOWER_MIN,
      manpowerCost: BREAKTHROUGH_ATTACK_MANPOWER_COST
    };
  }
  return {
    manpowerMin: ATTACK_MANPOWER_MIN,
    manpowerCost: actionType === "ATTACK" ? ATTACK_MANPOWER_COST : 0
  };
};

export const validateFrontierCommand = (
  input: ValidateFrontierCommandInput
): ValidateFrontierCommandResult => {
  const { manpowerMin, manpowerCost } = manpowerRequirements(input.actionType);
  if (input.actionType === "EXPAND" && input.to.ownerId) {
    return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
  }
  if (input.actionType === "ATTACK" && (!input.to.ownerId || input.to.ownerId === input.actor.id)) {
    return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
  }
  if (input.actionType === "BREAKTHROUGH_ATTACK" && !input.to.ownerId) {
    return { ok: false, code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" };
  }
  if (input.actionType === "BREAKTHROUGH_ATTACK" && !input.actor.techIds.has(input.breakthroughRequiredTechId)) {
    return { ok: false, code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" };
  }
  if (!input.isAdjacent && !input.isDockCrossing && !input.isBridgeCrossing) {
    return {
      ok: false,
      code: "NOT_ADJACENT",
      message: "target must be adjacent, valid dock crossing, or active aether bridge target"
    };
  }
  if (input.from.ownerId !== input.actor.id) {
    return { ok: false, code: "NOT_OWNER", message: "origin not owned" };
  }
  if (input.to.terrain !== "LAND") {
    return { ok: false, code: "BARRIER", message: "target is barrier" };
  }
  if (typeof input.originLockedUntil === "number" && input.originLockedUntil > input.now) {
    if (input.originLockOwnerId && input.originLockOwnerId !== input.actor.id) {
      return { ok: false, code: "LOCKED", message: "tile locked in combat" };
    }
    return {
      ok: false,
      code: "ATTACK_COOLDOWN",
      message: "origin tile is still on attack cooldown",
      cooldownRemainingMs: input.originLockedUntil - input.now
    };
  }
  if (typeof input.targetLockedUntil === "number" && input.targetLockedUntil > input.now) {
    if (input.targetLockOwnerId && input.targetLockOwnerId !== input.actor.id) {
      return { ok: false, code: "LOCKED", message: "tile locked in combat" };
    }
    return { ok: false, code: "LOCKED", message: "tile locked in combat" };
  }
  if ((input.actionType === "ATTACK" || input.actionType === "EXPAND") && input.actor.points < input.actionGoldCost) {
    return {
      ok: false,
      code: "INSUFFICIENT_GOLD",
      message: input.actionType === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim"
    };
  }
  if (input.actionType === "BREAKTHROUGH_ATTACK" && input.actor.points < input.breakthroughGoldCost) {
    return { ok: false, code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" };
  }
  if (input.actor.manpower < manpowerMin) {
    return {
      ok: false,
      code: "INSUFFICIENT_MANPOWER",
      message: `need ${manpowerMin.toFixed(0)} manpower to launch attack`
    };
  }
  if (input.defenderIsAlliedOrTruced) {
    return { ok: false, code: "ALLY_TARGET", message: "cannot attack allied or truced tile" };
  }
  if (input.targetShielded) {
    return { ok: false, code: "SHIELDED", message: "target shielded" };
  }
  return {
    ok: true,
    origin: { x: input.from.x, y: input.from.y },
    target: { x: input.to.x, y: input.to.y },
    resolvesAt: input.now + (input.actionType === "EXPAND" ? FRONTIER_CLAIM_MS : COMBAT_LOCK_MS),
    manpowerCost,
    manpowerMin
  };
};
