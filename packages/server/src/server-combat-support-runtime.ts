import type {
  EconomicStructure,
  Fort,
  OwnershipState,
  Player,
  SiegeOutpost,
  Tile,
  TileKey
} from "@border-empires/shared";
import type { StrategicResource, TileYieldBuffer } from "./server-shared-types.js";

export interface CombatResultChange {
  x: number;
  y: number;
  ownerId?: string;
  ownershipState?: OwnershipState;
}

export interface SettlementDefenseEntry {
  ownerId: string;
  expiresAt: number;
  mult: number;
}

export interface CreateServerCombatSupportRuntimeDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  DEEP_STRIKE_MAX_DISTANCE: number;
  NAVAL_INFILTRATION_MAX_RANGE: number;
  SETTLED_DEFENSE_NEAR_FORT_RADIUS: number;
  STAMINA_MAX: number;
  BARBARIAN_OWNER_ID: string;
  fortsByTile: Map<TileKey, Fort>;
  siegeOutpostsByTile: Map<TileKey, SiegeOutpost>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, OwnershipState>;
  settlementDefenseByTile: Map<TileKey, SettlementDefenseEntry>;
  vendettaCaptureCountsByPlayer: Map<string, Map<string, number>>;
  players: Map<string, Player>;
  tileYieldByTile: Map<TileKey, TileYieldBuffer>;
  parseKey: (tileKey: TileKey) => [number, number];
  key: (x: number, y: number) => TileKey;
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  now: () => number;
  wrappedChebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  getPlayerEffectsForPlayer: (playerId: string) => {
    fortDefenseMult: number;
    frontierDefenseAdd: number;
    outpostAttackMult: number;
    attackVsSettledMult: number;
    attackVsFortsMult: number;
    settledDefenseMult: number;
    settledDefenseNearFortMult: number;
  };
  supportedFrontierUsesSettledDefenseAt: (defenderId: string | undefined, target: Tile) => boolean;
  fortDefenseMultiplier: (options: {
    hasFort: boolean;
    hasWoodenFort: boolean;
    fortDefenseEffectsMult: number;
  }) => number;
  outpostAttackMultiplier: (options: {
    hasSiegeOutpost: boolean;
    hasLightOutpost: boolean;
    outpostAttackEffectsMult: number;
  }) => number;
  fortifiedTargetAttackMultiplier: (options: { targetHasFortification: boolean; originHasOutpost: boolean }) => number;
  truceBreakAttackMultiplier: (attackerId: string, defenderId: string) => number;
  resolveFailedBarbarianDefenseOutcome: (input: {
    fortHeldOrigin: boolean;
    origin: { x: number; y: number };
    target: { x: number; y: number };
  }) => { originLost: boolean; resultChanges: CombatResultChange[] };
  updateOwnership: (x: number, y: number, ownerId?: string, ownershipState?: OwnershipState) => void;
  getOrInitStrategicStocks: (playerId: string) => Record<StrategicResource, number>;
  strategicResourceKeys: readonly StrategicResource[];
  pruneEmptyTileYield: (tileKey: TileKey, yieldBuffer: TileYieldBuffer) => void;
}

export interface ServerCombatSupportRuntime {
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  lineTilesBetween: (ax: number, ay: number, bx: number, by: number) => Array<{ x: number; y: number }>;
  validDeepStrikeTarget: (from: Tile, to: Tile) => boolean;
  validNavalInfiltrationTarget: (from: Tile, to: Tile) => boolean;
  fortOperationalForOwner: (ownerId: string, tileKey: TileKey) => boolean;
  woodenFortOperationalForOwner: (ownerId: string, tileKey: TileKey) => boolean;
  siegeOutpostOperationalForOwner: (ownerId: string, tileKey: TileKey) => boolean;
  lightOutpostOperationalForOwner: (ownerId: string, tileKey: TileKey) => boolean;
  targetHasActiveFortification: (ownerId: string, tileKey: TileKey) => boolean;
  originHasActiveOutpost: (ownerId: string, tileKey: TileKey) => boolean;
  fortDefenseMultAt: (defenderId: string, tileKey: TileKey) => number;
  settledDefenseNearFortApplies: (defenderId: string, target: Tile) => boolean;
  settlementDefenseMultAt: (defenderId: string, tileKey: TileKey) => number;
  ownershipDefenseMultiplierForTarget: (defenderId: string | undefined, target: Tile) => number;
  frontierDefenseAddForTarget: (defenderId: string, target: Tile) => number;
  outpostAttackMultAt: (attackerId: string, tileKey: TileKey) => number;
  attackMultiplierForTarget: (attackerId: string, target: Tile, originTileKey?: TileKey) => number;
  settledDefenseMultiplierForTarget: (defenderId: string, target: Tile) => number;
  originTileHeldByActiveFort: (actorId: string, tileKey: TileKey) => boolean;
  applyFailedAttackTerritoryOutcome: (
    actorId: string,
    defenderOwnerId: string | undefined,
    defenderIsBarbarian: boolean,
    from: Tile,
    to: Tile,
    originTileKey: TileKey,
    targetTileKey: TileKey
  ) => { resultChanges: CombatResultChange[]; originLost: boolean };
  incrementVendettaCount: (attackerId: string, targetId: string) => void;
  isAlly: (a: string, b: string) => boolean;
  applyStaminaRegen: (player: Player) => void;
  settleAttackManpower: (player: Player, committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number) => number;
  settledTileCountForPlayer: (player: Player) => number;
  seizeStoredYieldOnCapture: (attacker: Player, tileKey: TileKey) => { gold: number; strategic: Partial<Record<StrategicResource, number>> };
  pillageSettledTile: (
    attacker: Player,
    defender: Player,
    defenderTileCountBeforeCapture: number
  ) => { gold: number; strategic: Partial<Record<StrategicResource, number>>; share: number };
}

export const createServerCombatSupportRuntime = (
  deps: CreateServerCombatSupportRuntimeDeps
): ServerCombatSupportRuntime => {
  const chebyshevDistance = (ax: number, ay: number, bx: number, by: number): number => {
    const dx = Math.min(Math.abs(ax - bx), deps.WORLD_WIDTH - Math.abs(ax - bx));
    const dy = Math.min(Math.abs(ay - by), deps.WORLD_HEIGHT - Math.abs(ay - by));
    return Math.max(dx, dy);
  };

  const lineTilesBetween = (ax: number, ay: number, bx: number, by: number): Array<{ x: number; y: number }> => {
    const steps = chebyshevDistance(ax, ay, bx, by);
    if (steps <= 1) return [];
    const tiles: Array<{ x: number; y: number }> = [];
    for (let i = 1; i < steps; i += 1) {
      const ratio = i / steps;
      tiles.push({
        x: deps.wrapX(Math.round(ax + (bx - ax) * ratio), deps.WORLD_WIDTH),
        y: deps.wrapY(Math.round(ay + (by - ay) * ratio), deps.WORLD_HEIGHT)
      });
    }
    return tiles;
  };

  const validDeepStrikeTarget = (from: Tile, to: Tile): boolean => {
    if (from.ownerId === undefined) return false;
    const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
    if (distance < 2 || distance > deps.DEEP_STRIKE_MAX_DISTANCE) return false;
    for (const step of lineTilesBetween(from.x, from.y, to.x, to.y)) {
      if (deps.terrainAtRuntime(step.x, step.y) === "MOUNTAIN") return false;
    }
    return true;
  };

  const validNavalInfiltrationTarget = (from: Tile, to: Tile): boolean => {
    const distance = chebyshevDistance(from.x, from.y, to.x, to.y);
    if (distance < 2 || distance > deps.NAVAL_INFILTRATION_MAX_RANGE) return false;
    const middle = lineTilesBetween(from.x, from.y, to.x, to.y);
    if (middle.length === 0) return false;
    if (!middle.some((step) => deps.terrainAtRuntime(step.x, step.y) === "SEA")) return false;
    if (middle.some((step) => deps.terrainAtRuntime(step.x, step.y) === "MOUNTAIN")) return false;
    if (middle.some((step) => deps.terrainAtRuntime(step.x, step.y) === "LAND")) return false;
    return to.terrain === "LAND";
  };

  const fortRecoveryReadyAt = (fort: Pick<Fort, "disabledUntil">): number => fort.disabledUntil ?? 0;

  const fortOperationalForOwner = (ownerId: string, tileKey: TileKey): boolean => {
    const fort = deps.fortsByTile.get(tileKey);
    if (!fort || fort.ownerId !== ownerId || fort.status !== "active") return false;
    const [x, y] = deps.parseKey(tileKey);
    if (deps.terrainAtRuntime(x, y) !== "LAND" || deps.ownership.get(tileKey) !== ownerId) return false;
    return fortRecoveryReadyAt(fort) <= deps.now();
  };

  const woodenFortOperationalForOwner = (ownerId: string, tileKey: TileKey): boolean => {
    const structure = deps.economicStructuresByTile.get(tileKey);
    if (!structure || structure.ownerId !== ownerId || structure.status !== "active" || structure.type !== "WOODEN_FORT") return false;
    const [x, y] = deps.parseKey(tileKey);
    return deps.terrainAtRuntime(x, y) === "LAND" && deps.ownership.get(tileKey) === ownerId;
  };

  const siegeOutpostOperationalForOwner = (ownerId: string, tileKey: TileKey): boolean => {
    const siegeOutpost = deps.siegeOutpostsByTile.get(tileKey);
    if (!siegeOutpost || siegeOutpost.ownerId !== ownerId || siegeOutpost.status !== "active") return false;
    const [x, y] = deps.parseKey(tileKey);
    return deps.terrainAtRuntime(x, y) === "LAND" && deps.ownership.get(tileKey) === ownerId;
  };

  const lightOutpostOperationalForOwner = (ownerId: string, tileKey: TileKey): boolean => {
    const structure = deps.economicStructuresByTile.get(tileKey);
    if (!structure || structure.ownerId !== ownerId || structure.status !== "active" || structure.type !== "LIGHT_OUTPOST") return false;
    const [x, y] = deps.parseKey(tileKey);
    return deps.terrainAtRuntime(x, y) === "LAND" && deps.ownership.get(tileKey) === ownerId;
  };

  const targetHasActiveFortification = (ownerId: string, tileKey: TileKey): boolean =>
    fortOperationalForOwner(ownerId, tileKey) || woodenFortOperationalForOwner(ownerId, tileKey);

  const originHasActiveOutpost = (ownerId: string, tileKey: TileKey): boolean =>
    siegeOutpostOperationalForOwner(ownerId, tileKey) || lightOutpostOperationalForOwner(ownerId, tileKey);

  const fortDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
    if (fortOperationalForOwner(defenderId, tileKey)) {
      return deps.fortDefenseMultiplier({
        hasFort: true,
        hasWoodenFort: false,
        fortDefenseEffectsMult: deps.getPlayerEffectsForPlayer(defenderId).fortDefenseMult
      });
    }
    return deps.fortDefenseMultiplier({
      hasFort: false,
      hasWoodenFort: woodenFortOperationalForOwner(defenderId, tileKey),
      fortDefenseEffectsMult: deps.getPlayerEffectsForPlayer(defenderId).fortDefenseMult
    });
  };

  const settledDefenseNearFortApplies = (defenderId: string, target: Tile): boolean => {
    for (const [tileKey, fort] of deps.fortsByTile) {
      if (fort.ownerId !== defenderId || fort.status !== "active") continue;
      if (fortRecoveryReadyAt(fort) > deps.now()) continue;
      const [x, y] = deps.parseKey(tileKey);
      if (deps.terrainAtRuntime(x, y) !== "LAND" || deps.ownership.get(tileKey) !== defenderId) continue;
      if (deps.wrappedChebyshevDistance(x, y, target.x, target.y) <= deps.SETTLED_DEFENSE_NEAR_FORT_RADIUS) return true;
    }
    for (const [tileKey, structure] of deps.economicStructuresByTile) {
      if (structure.ownerId !== defenderId || structure.status !== "active" || structure.type !== "WOODEN_FORT") continue;
      const [x, y] = deps.parseKey(tileKey);
      if (deps.terrainAtRuntime(x, y) !== "LAND" || deps.ownership.get(tileKey) !== defenderId) continue;
      if (deps.wrappedChebyshevDistance(x, y, target.x, target.y) <= deps.SETTLED_DEFENSE_NEAR_FORT_RADIUS) return true;
    }
    return false;
  };

  const settlementDefenseMultAt = (defenderId: string, tileKey: TileKey): number => {
    const entry = deps.settlementDefenseByTile.get(tileKey);
    if (!entry || entry.ownerId !== defenderId || entry.expiresAt <= deps.now()) return 1;
    return entry.mult;
  };

  const ownershipDefenseMultiplierForTarget = (defenderId: string | undefined, target: Tile): number => {
    if (deps.supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 1;
    return target.ownershipState === "FRONTIER" ? 0 : 1;
  };

  const frontierDefenseAddForTarget = (defenderId: string, target: Tile): number => {
    if (target.ownershipState !== "FRONTIER") return 0;
    if (deps.supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 0;
    return deps.getPlayerEffectsForPlayer(defenderId).frontierDefenseAdd;
  };

  const outpostAttackMultAt = (attackerId: string, tileKey: TileKey): number =>
    deps.outpostAttackMultiplier({
      hasSiegeOutpost: siegeOutpostOperationalForOwner(attackerId, tileKey),
      hasLightOutpost: lightOutpostOperationalForOwner(attackerId, tileKey),
      outpostAttackEffectsMult: deps.getPlayerEffectsForPlayer(attackerId).outpostAttackMult
    });

  const attackMultiplierForTarget = (attackerId: string, target: Tile, originTileKey?: TileKey): number => {
    const effects = deps.getPlayerEffectsForPlayer(attackerId);
    let mult = 1;
    if (target.ownershipState === "SETTLED") mult *= effects.attackVsSettledMult;
    const targetKey = deps.key(target.x, target.y);
    const fortifiedTarget = target.ownerId ? targetHasActiveFortification(target.ownerId, targetKey) : false;
    if (fortifiedTarget) mult *= effects.attackVsFortsMult;
    mult *= deps.fortifiedTargetAttackMultiplier({
      targetHasFortification: fortifiedTarget,
      originHasOutpost: originTileKey ? originHasActiveOutpost(attackerId, originTileKey) : false
    });
    if (target.ownerId) mult *= deps.truceBreakAttackMultiplier(attackerId, target.ownerId);
    return mult;
  };

  const settledDefenseMultiplierForTarget = (defenderId: string, target: Tile): number => {
    if (target.ownershipState !== "SETTLED" && !deps.supportedFrontierUsesSettledDefenseAt(defenderId, target)) return 1;
    const effects = deps.getPlayerEffectsForPlayer(defenderId);
    let mult = effects.settledDefenseMult;
    if (
      target.ownershipState === "SETTLED" &&
      effects.settledDefenseNearFortMult > 1 &&
      settledDefenseNearFortApplies(defenderId, target)
    ) {
      mult *= effects.settledDefenseNearFortMult;
    }
    return mult;
  };

  const originTileHeldByActiveFort = (actorId: string, tileKey: TileKey): boolean =>
    fortOperationalForOwner(actorId, tileKey) || woodenFortOperationalForOwner(actorId, tileKey);

  const applyFailedAttackTerritoryOutcome = (
    actorId: string,
    defenderOwnerId: string | undefined,
    defenderIsBarbarian: boolean,
    from: Tile,
    to: Tile,
    originTileKey: TileKey,
    targetTileKey: TileKey
  ): { resultChanges: CombatResultChange[]; originLost: boolean } => {
    const fortHeldOrigin = originTileHeldByActiveFort(actorId, originTileKey);
    if (defenderIsBarbarian) {
      const failedOutcome = deps.resolveFailedBarbarianDefenseOutcome({
        fortHeldOrigin,
        origin: { x: from.x, y: from.y },
        target: { x: to.x, y: to.y }
      });
      if (failedOutcome.originLost) {
        deps.updateOwnership(from.x, from.y, deps.BARBARIAN_OWNER_ID, "BARBARIAN");
        deps.updateOwnership(to.x, to.y, undefined);
      }
      return failedOutcome;
    }
    if (!defenderOwnerId || fortHeldOrigin) return { resultChanges: [], originLost: false };
    deps.updateOwnership(from.x, from.y, defenderOwnerId, "FRONTIER");
    return {
      originLost: true,
      resultChanges: [{ x: from.x, y: from.y, ownerId: defenderOwnerId, ownershipState: "FRONTIER" }]
    };
  };

  const incrementVendettaCount = (attackerId: string, targetId: string): void => {
    let map = deps.vendettaCaptureCountsByPlayer.get(attackerId);
    if (!map) {
      map = new Map<string, number>();
      deps.vendettaCaptureCountsByPlayer.set(attackerId, map);
    }
    map.set(targetId, (map.get(targetId) ?? 0) + 1);
  };

  const isAlly = (a: string, b: string): boolean => Boolean(deps.players.get(a)?.allies.has(b));

  const applyStaminaRegen = (player: Player): void => {
    player.stamina = deps.STAMINA_MAX;
    player.staminaUpdatedAt = deps.now();
  };

  const settleAttackManpower = (player: Player, committedManpower: number, attackerWon: boolean, atkEff: number, defEff: number): number => {
    if (committedManpower <= 0) return 0;
    if (attackerWon) {
      const loss = Math.max(10, committedManpower * 0.16);
      player.manpower = Math.max(0, player.manpower - loss);
      return loss;
    }
    const combatRatio = defEff / Math.max(1, atkEff);
    const loss = committedManpower * Math.min(1.25, 0.6 + combatRatio * 0.35);
    player.manpower = Math.max(0, player.manpower - loss);
    return loss;
  };

  const settledTileCountForPlayer = (player: Player): number => {
    let count = 0;
    for (const tileKey of player.territoryTiles) {
      if (deps.ownershipStateByTile.get(tileKey) === "SETTLED") count += 1;
    }
    return count;
  };

  const seizeStoredYieldOnCapture = (attacker: Player, tileKey: TileKey): { gold: number; strategic: Partial<Record<StrategicResource, number>> } => {
    const out = { gold: 0, strategic: {} as Partial<Record<StrategicResource, number>> };
    const yieldBuffer = deps.tileYieldByTile.get(tileKey);
    if (!yieldBuffer) return out;
    const gold = Math.floor(yieldBuffer.gold * 100) / 100;
    if (gold > 0) {
      attacker.points += gold;
      out.gold = gold;
      yieldBuffer.gold = 0;
    }
    const stock = deps.getOrInitStrategicStocks(attacker.id);
    for (const resource of deps.strategicResourceKeys) {
      const amount = Math.floor((yieldBuffer.strategic[resource] ?? 0) * 100) / 100;
      if (amount <= 0) continue;
      stock[resource] += amount;
      out.strategic[resource] = amount;
      yieldBuffer.strategic[resource] = 0;
    }
    deps.pruneEmptyTileYield(tileKey, yieldBuffer);
    return out;
  };

  const pillageSettledTile = (
    attacker: Player,
    defender: Player,
    defenderTileCountBeforeCapture: number
  ): { gold: number; strategic: Partial<Record<StrategicResource, number>>; share: number } => {
    const share = 1 / Math.max(1, defenderTileCountBeforeCapture);
    const gold = Math.max(0, defender.points * share);
    defender.points = Math.max(0, defender.points - gold);
    attacker.points += gold;

    const strategic: Partial<Record<StrategicResource, number>> = {};
    const attackerStocks = deps.getOrInitStrategicStocks(attacker.id);
    const defenderStocks = deps.getOrInitStrategicStocks(defender.id);
    for (const resource of deps.strategicResourceKeys) {
      const available = Math.max(0, defenderStocks[resource] ?? 0);
      const amount = available * share;
      if (amount <= 0) continue;
      defenderStocks[resource] = Math.max(0, available - amount);
      attackerStocks[resource] = (attackerStocks[resource] ?? 0) + amount;
      strategic[resource] = amount;
    }
    return { gold, strategic, share };
  };

  return {
    chebyshevDistance,
    lineTilesBetween,
    validDeepStrikeTarget,
    validNavalInfiltrationTarget,
    fortOperationalForOwner,
    woodenFortOperationalForOwner,
    siegeOutpostOperationalForOwner,
    lightOutpostOperationalForOwner,
    targetHasActiveFortification,
    originHasActiveOutpost,
    fortDefenseMultAt,
    settledDefenseNearFortApplies,
    settlementDefenseMultAt,
    ownershipDefenseMultiplierForTarget,
    frontierDefenseAddForTarget,
    outpostAttackMultAt,
    attackMultiplierForTarget,
    settledDefenseMultiplierForTarget,
    originTileHeldByActiveFort,
    applyFailedAttackTerritoryOutcome,
    incrementVendettaCount,
    isAlly,
    applyStaminaRegen,
    settleAttackManpower,
    settledTileCountForPlayer,
    seizeStoredYieldOnCapture,
    pillageSettledTile
  };
};
