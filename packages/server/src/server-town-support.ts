import type { Player, PopulationTier, TileKey } from "@border-empires/shared";

import type { ManpowerBreakdownLine, TownDefinition } from "./server-shared-types.js";

type TownSupportDeps = Record<string, any>;

export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;

export const createServerTownSupport = (deps: TownSupportDeps) => {
  const {
    now,
    parseKey,
    key,
    wrapX,
    wrapY,
    chebyshevDistance,
    WORLD_WIDTH,
    WORLD_HEIGHT,
    POPULATION_TOWN_MIN,
    MANPOWER_EPSILON,
    TOWN_MANPOWER_BY_TIER,
    townsByTile,
    ownership,
    ownershipStateByTile,
    townGrowthShockUntilByTile,
    townCaptureShockUntilByTile,
    terrainAt,
    ownedTownKeysForPlayer,
    isTownFedForOwner
  } = deps;

  const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;
  const TOWN_CAPTURE_GROWTH_RADIUS = 20;

  const applyTownWarShock = (tileKey: TileKey): void => {
    const [x, y] = parseKey(tileKey);
    const until = now() + TOWN_CAPTURE_SHOCK_MS;
    for (const otherTownKey of townsByTile.keys()) {
      const [ox, oy] = parseKey(otherTownKey);
      if (chebyshevDistance(ox, oy, x, y) > TOWN_CAPTURE_GROWTH_RADIUS) continue;
      const currentUntil = townGrowthShockUntilByTile.get(otherTownKey) ?? 0;
      townGrowthShockUntilByTile.set(otherTownKey, Math.max(currentUntil, until));
    }
  };

  const applyTownCaptureShock = (tileKey: TileKey): void => {
    const until = now() + TOWN_CAPTURE_SHOCK_MS;
    townCaptureShockUntilByTile.set(tileKey, until);
    applyTownWarShock(tileKey);
  };

  const applyTownCapturePopulationLoss = (town: TownDefinition): void => {
    if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) return;
    town.population = Math.max(1, town.population * TOWN_CAPTURE_POPULATION_LOSS_MULT);
  };

  const townSupport = (townKey: TileKey, ownerId: string): { supportCurrent: number; supportMax: number } => {
    const town = townsByTile.get(townKey);
    if (town && townPopulationTierForTown(town) === "SETTLEMENT") return { supportCurrent: 0, supportMax: 0 };
    const [x, y] = parseKey(townKey);
    let supportCurrent = 0;
    let supportMax = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = wrapX(x + dx, WORLD_WIDTH);
        const ny = wrapY(y + dy, WORLD_HEIGHT);
        if (terrainAt(nx, ny) !== "LAND") continue;
        supportMax += 1;
        const nk = key(nx, ny);
        if (ownership.get(nk) !== ownerId) continue;
        if (ownershipStateByTile.get(nk) !== "SETTLED") continue;
        supportCurrent += 1;
      }
    }
    return { supportCurrent, supportMax };
  };

  const townPopulationTier = (population: number): PopulationTier => {
    if (population >= 5_000_000) return "METROPOLIS";
    if (population >= 1_000_000) return "GREAT_CITY";
    if (population >= 100_000) return "CITY";
    if (population >= POPULATION_TOWN_MIN) return "TOWN";
    return "SETTLEMENT";
  };

  const townPopulationTierForTown = (town: TownDefinition): PopulationTier => {
    if (town.isSettlement && town.population < POPULATION_TOWN_MIN) return "SETTLEMENT";
    return townPopulationTier(town.population);
  };

  const townPopulationMultiplier = (population: number): number => {
    const tier = townPopulationTier(population);
    if (tier === "SETTLEMENT") return 0.6;
    if (tier === "CITY") return 1.5;
    if (tier === "GREAT_CITY") return 2.5;
    if (tier === "METROPOLIS") return 3.2;
    return 1;
  };

  const townManpowerSnapshotForOwner = (
    town: TownDefinition,
    ownerId: string | undefined
  ): { cap: number; regenPerMinute: number } => {
    if (!ownerId) return { cap: 0, regenPerMinute: 0 };
    if (!isTownFedForOwner(ownerId, town.tileKey)) return { cap: 0, regenPerMinute: 0 };
    const base = TOWN_MANPOWER_BY_TIER[townPopulationTierForTown(town)] ?? { cap: 0, regenPerMinute: 0 };
    if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) {
      return { cap: 0, regenPerMinute: 0 };
    }
    return base;
  };

  const playerManpowerCap = (player: Player): number => {
    let cap = 0;
    for (const tk of ownedTownKeysForPlayer(player.id)) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      cap += townManpowerSnapshotForOwner(town, player.id).cap;
    }
    return Math.max(0, cap);
  };

  const manpowerRegenWeightForSettlementIndex = (index: number): number => {
    if (index < 5) return 1;
    if (index < 15) return 0.5;
    return 0.2;
  };

  const prettyTownTypeLabel = (type: TownDefinition["type"]): string => {
    if (type === "MARKET") return "Market";
    if (type === "FARMING") return "Farming";
    return "Ancient";
  };

  const prettyTownName = (town: TownDefinition, tileKey = town.tileKey): string => {
    if (town.name?.trim()) return town.name;
    const [x, y] = parseKey(tileKey);
    return `${prettyTownTypeLabel(town.type)} town (${x}, ${y})`;
  };

  const playerManpowerRegenPerMinute = (player: Player): number => {
    let regen = 0;
    const townKeys = ownedTownKeysForPlayer(player.id);
    for (const [index, tk] of townKeys.entries()) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      regen += townManpowerSnapshotForOwner(town, player.id).regenPerMinute * manpowerRegenWeightForSettlementIndex(index);
    }
    return Math.max(0, regen);
  };

  const playerManpowerBreakdown = (
    player: Player
  ): { cap: ManpowerBreakdownLine[]; regen: ManpowerBreakdownLine[] } => {
    const cap: ManpowerBreakdownLine[] = [];
    const regen: ManpowerBreakdownLine[] = [];
    const townKeys = ownedTownKeysForPlayer(player.id);
    for (const [index, tk] of townKeys.entries()) {
      const town = townsByTile.get(tk);
      if (!town) continue;
      const snapshot = townManpowerSnapshotForOwner(town, player.id);
      if (snapshot.cap > 0) {
        const tier = townPopulationTierForTown(town);
        const captured = (townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now();
        cap.push({
          label: `${prettyTownName(town, tk)} (${tier.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())})`,
          amount: snapshot.cap,
          ...(captured ? { note: "Recently captured" } : {})
        });
      }
      if (snapshot.regenPerMinute > 0) {
        const weight = manpowerRegenWeightForSettlementIndex(index);
        const amount = snapshot.regenPerMinute * weight;
        regen.push({
          label: prettyTownName(town, tk),
          amount,
          ...(weight < 1 ? { note: `${Math.round(weight * 100)}% weight` } : {})
        });
      }
    }
    return { cap, regen };
  };

  const effectiveManpowerAt = (player: Player, nowMs = now()): number => {
    const cap = playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) return cap;
    if (!Number.isFinite(player.manpowerUpdatedAt)) return Math.min(cap, Math.max(0, player.manpower));
    const elapsedMinutes = Math.max(0, (nowMs - player.manpowerUpdatedAt) / 60_000);
    const regenPerMinute = playerManpowerRegenPerMinute(player);
    const nextManpower = elapsedMinutes > 0 ? player.manpower + elapsedMinutes * regenPerMinute : player.manpower;
    return Math.max(0, Math.min(cap, nextManpower));
  };

  const townGoldIncomeEnabledForPlayer = (player: Player, nowMs = now()): boolean =>
    effectiveManpowerAt(player, nowMs) + MANPOWER_EPSILON >= playerManpowerCap(player);

  const applyManpowerRegen = (player: Player): void => {
    const cap = playerManpowerCap(player);
    if (!Number.isFinite(player.manpower)) player.manpower = cap;
    const previousCap = Number.isFinite(player.manpowerCapSnapshot) ? player.manpowerCapSnapshot! : cap;
    if (cap > previousCap) {
      player.manpower = Math.min(cap, Math.max(0, player.manpower) + (cap - previousCap));
    }
    if (!Number.isFinite(player.manpowerUpdatedAt)) {
      player.manpower = Math.min(cap, Math.max(0, player.manpower));
      player.manpowerUpdatedAt = now();
      player.manpowerCapSnapshot = cap;
      return;
    }
    const nowMs = now();
    player.manpower = effectiveManpowerAt(player, nowMs);
    player.manpowerUpdatedAt = nowMs;
    player.manpowerCapSnapshot = cap;
  };

  return {
    applyTownWarShock,
    applyTownCaptureShock,
    applyTownCapturePopulationLoss,
    townSupport,
    townPopulationTier,
    townPopulationTierForTown,
    townPopulationMultiplier,
    townManpowerSnapshotForOwner,
    playerManpowerCap,
    manpowerRegenWeightForSettlementIndex,
    prettyTownName,
    playerManpowerRegenPerMinute,
    playerManpowerBreakdown,
    effectiveManpowerAt,
    townGoldIncomeEnabledForPlayer,
    applyManpowerRegen
  };
};
