// Re-export domain modules promoted into game-domain.
export * from "../frontier-combat-multipliers.js";
export * from "../server-game-constants/server-game-constants.js";
export * from "../server-shared-types.js";
export * from "../server-worldgen-clusters.js";
export * from "../server-worldgen-docks/server-worldgen-docks.js";
export * from "../server-worldgen-island-connectivity.js";
export * from "../server-worldgen-shards.js";
export * from "../server-worldgen-terrain.js";
export * from "../server-worldgen-towns.js";
export * from "../town-names.js";
export * from "../victory-pressure-utils.js";

import {
  ATTACK_MANPOWER_COST,
  ATTACK_MANPOWER_MIN,
  BARBARIAN_RAID_COST,
  COMBAT_LOCK_MS,
  FRONTIER_CLAIM_MS,
  MUSTER_ATTACK_COST,
  type ChosenTrickleResource,
  type Tile
} from "@border-empires/shared";

export const fortAttackManpowerMultiplier = (tile: Pick<DomainTileState, "fort" | "economicStructure">): number => {
  if (tile.fort?.status === "active") {
    if (tile.fort.variant === "THUNDER_BASTION") return 20;
    if (tile.fort.variant === "IRON_BASTION") return 10;
    return 5;
  }
  if (tile.economicStructure?.type === "WOODEN_FORT" && tile.economicStructure.status === "active") return 1.5;
  return 1;
};

export type FrontierCommandType = "ATTACK" | "EXPAND";
export type DomainStrategicResourceKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";

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
  // Persistent sub-choice for domains that ask the player to pick a resource
  // (Clockwork Stipend). Locked on pick; null/undefined means no choice yet.
  // Narrowed to the trickle subset (IRON / SUPPLY / CRYSTAL) — FOOD and SHARD
  // are intentionally excluded because no trickle domain offers them.
  chosenTrickleResource?: ChosenTrickleResource | undefined;
  // Emperor-endorsement bonus (galaxy meta-layer Phase 1): remaining Imperial
  // Ward activations. Granted once when an endorsed player first spawns
  // territory in the season they were endorsed for; undefined/0 means none
  // remaining. The *active* 10-minute invulnerability window itself is
  // ephemeral runtime state (Runtime.abilityCooldowns), not persisted here —
  // same convention as Aegis Lock.
  imperialWardCharges?: number;
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
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: Tile["frontierDecayKind"] | undefined;
  breachShockUntil?: number | undefined;
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
            | "captureShockUntil"
            | "populationBeforeCapture"
            | "nearbyWarPausedUntil"
            | "nearbyWarLastAt"
            | "growthModifiers"
          >
        >)
    | undefined;
  fort?:
    | {
        ownerId: string;
        status: NonNullable<Tile["fort"]>["status"];
        variant?: NonNullable<Tile["fort"]>["variant"] | undefined;
        completesAt?: number | undefined;
        disabledUntil?: number | undefined;
        previousStatus?: "active" | undefined;
        garrison?: number | undefined;
        garrisonCap?: number | undefined;
        garrisonUpdatedAt?: number | undefined;
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
        variant?: NonNullable<Tile["siegeOutpost"]>["variant"] | undefined;
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
        bombardCooldownUntil?: number | undefined;
      }
    | undefined;
  sabotage?:
    | {
        ownerId: string;
        endsAt: number;
        outputMultiplier: number;
      }
    | undefined;
  muster?:
    | {
        ownerId: string;
        amount: number;
        mode: "HOLD" | "ADVANCE";
        targetX?: number;
        targetY?: number;
        setAt?: number;
        updatedAt: number;
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
  isAdjacent: boolean;
  isDockCrossing: boolean;
  isBridgeCrossing: boolean;
  targetShielded: boolean;
  defenderIsAlliedOrTruced: boolean;
  expandClaimDurationMs?: number | undefined;
  /** Mustering system: when true, attacks consume the origin tile's muster. */
  musterSystemEnabled?: boolean | undefined;
  /** Manpower currently mustered on the origin tile (used when the flag is on). */
  originMuster?: number | undefined;
  /** Required muster for this attack (defaults to MUSTER_ATTACK_COST). */
  requiredMuster?: number | undefined;
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
  actionType: FrontierCommandType,
  target: DomainTileState
): { manpowerMin: number; manpowerCost: number } => {
  const attackMultiplier = actionType === "ATTACK" ? fortAttackManpowerMultiplier(target) : 1;
  return {
    manpowerMin: actionType === "ATTACK" ? ATTACK_MANPOWER_MIN * attackMultiplier : 0,
    manpowerCost: actionType === "ATTACK" ? ATTACK_MANPOWER_COST * attackMultiplier : 0
  };
};

export const validateFrontierCommand = (
  input: ValidateFrontierCommandInput
): ValidateFrontierCommandResult => {
  const legacy = manpowerRequirements(input.actionType, input.to);
  const musterAttack = input.musterSystemEnabled === true && input.actionType === "ATTACK";
  const requiredMuster = input.requiredMuster ?? MUSTER_ATTACK_COST;
  const isBarbRaid = musterAttack && input.to.ownerId === "barbarian-1";
  const isBarbarianAttack = musterAttack && input.actor.id === "barbarian-1";
  // Under the muster system an attack is paid from the origin tile's muster
  // reservoir (a single, legible number), not from the global pool times the
  // legacy fort multiplier. Barbarian raids skip muster wind-up and are funded
  // from the player pool at BARBARIAN_RAID_COST. Barbarian-origin attacks are
  // limited by per-tile cooldown instead of manpower.
  const effectiveCost = isBarbarianAttack ? 0 : isBarbRaid ? BARBARIAN_RAID_COST : requiredMuster;
  const manpowerMin = musterAttack ? effectiveCost : legacy.manpowerMin;
  const manpowerCost = musterAttack ? effectiveCost : legacy.manpowerCost;
  if (input.actionType === "EXPAND" && input.to.ownerId) {
    return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
  }
  if (input.actionType === "ATTACK" && (!input.to.ownerId || input.to.ownerId === input.actor.id)) {
    return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
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
    if (input.actionType === "EXPAND") {
      // Frontier expansion from your own recently used origin tile is allowed.
      // Cooldown remains enforced for attack actions.
    } else {
      return {
        ok: false,
        code: "ATTACK_COOLDOWN",
        message: "origin tile is still on attack cooldown",
        cooldownRemainingMs: input.originLockedUntil - input.now
      };
    }
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
  if (isBarbRaid) {
    // Advance-mode barbarian raids draw from the muster flag's pool.
    // Manual raids without a flag use the player's global pool.
    if (musterAttack && (input.originMuster ?? 0) >= requiredMuster) {
      // Flag has enough mustered manpower — proceed.
    } else if (input.actor.manpower < BARBARIAN_RAID_COST) {
      return {
        ok: false,
        code: "INSUFFICIENT_MANPOWER",
        message: `need ${BARBARIAN_RAID_COST} manpower for barbarian raid`
      };
    }
  } else if (musterAttack && !isBarbarianAttack) {
    if ((input.originMuster ?? 0) < requiredMuster) {
      return {
        ok: false,
        code: "INSUFFICIENT_MUSTER",
        message: `need ${requiredMuster.toFixed(0)} mustered manpower to launch attack`
      };
    }
  } else if (input.actor.manpower < manpowerMin) {
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
    resolvesAt:
      input.now +
      (input.actionType === "EXPAND"
        ? (input.expandClaimDurationMs ?? FRONTIER_CLAIM_MS)
        : COMBAT_LOCK_MS),
    manpowerCost,
    manpowerMin
  };
};
