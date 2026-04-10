import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  ADVANCED_IRONWORKS_IRON_PER_DAY,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL,
  ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  FUR_SYNTHESIZER_OVERLOAD_SUPPLY,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_GOLD_UPKEEP,
  IRONWORKS_IRON_PER_DAY,
  IRONWORKS_OVERLOAD_IRON,
  SYNTH_OVERLOAD_GOLD_COST
} from "./server-game-constants.js";

const serverSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
    readFileSync(resolve(here, "./server-player-economy-runtime.ts"), "utf8"),
    readFileSync(resolve(here, "./server-economic-operations.ts"), "utf8"),
    readFileSync(resolve(here, "./server-territory-structure-runtime.ts"), "utf8"),
    readFileSync(resolve(here, "./server-town-economy-runtime.ts"), "utf8"),
    readFileSync(resolve(here, "./server-game-constants.ts"), "utf8"),
    readFileSync(resolve(here, "./server-player-progression.ts"), "utf8"),
    readFileSync(resolve(here, "./server-status-metrics.ts"), "utf8"),
    readFileSync(resolve(here, "./server-victory-pressure.ts"), "utf8"),
    readFileSync(resolve(here, "./server-tech-domain-runtime.ts"), "utf8")
  ].join("\n");
};

describe("economy balance regression guard", () => {
  it("keeps the reduced base gold values for towns and docks", () => {
    const source = serverSource();
    expect(source).toContain("const TOWN_BASE_GOLD_PER_MIN = 2;");
    expect(source).toContain("const DOCK_INCOME_PER_MIN = 0.5;");
  });

  it("includes customs houses in dock income and exposes dock modifier summaries", () => {
    const source = serverSource();
    expect(source).toContain('const dockCustomsHouseIncomeMultiplierAt = (dockKey: TileKey, ownerId: string | undefined): number => {');
    expect(source).toContain('const dockSummaryForOwner = (dock: Dock, ownerId: string | undefined): Tile["dock"] | undefined => {');
    expect(source).toContain('pushModifier("Customs House"');
    expect(source).toContain('* dockCustomsHouseIncomeMultiplierAt(dock.tileKey, ownerId);');
    expect(source).toContain("if (dockSummary) tile.dock = dockSummary;");
  });

  it("keeps synth overload on a 24 hour downtime and includes converter output in strategic income", () => {
    const source = serverSource();
    expect(source).toContain("const SYNTH_OVERLOAD_DISABLE_MS = 24 * 60 * 60_000;");
    expect(source).toContain("const output = converterStructureOutputFor(structure.type) ?? {};");
  });

  it("keeps synth upkeep at the reduced half-cost values", () => {
    expect(FUR_SYNTHESIZER_GOLD_UPKEEP).toBe(60);
    expect(IRONWORKS_GOLD_UPKEEP).toBe(60);
    expect(CRYSTAL_SYNTHESIZER_GOLD_UPKEEP).toBe(80);
  });

  it("keeps synth overload strictly worse than waiting 24 hours", () => {
    const upkeepTicksPerDay = (24 * 60 * 60_000) / ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS;
    const mostExpensive24hUpkeep = Math.max(
      FUR_SYNTHESIZER_GOLD_UPKEEP * upkeepTicksPerDay,
      IRONWORKS_GOLD_UPKEEP * upkeepTicksPerDay,
      CRYSTAL_SYNTHESIZER_GOLD_UPKEEP * upkeepTicksPerDay
    );

    expect(SYNTH_OVERLOAD_GOLD_COST).toBeGreaterThan(mostExpensive24hUpkeep);
    expect(FUR_SYNTHESIZER_OVERLOAD_SUPPLY).toBeLessThan(FUR_SYNTHESIZER_SUPPLY_PER_DAY);
    expect(FUR_SYNTHESIZER_OVERLOAD_SUPPLY).toBeLessThan(ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY);
    expect(IRONWORKS_OVERLOAD_IRON).toBeLessThan(IRONWORKS_IRON_PER_DAY);
    expect(IRONWORKS_OVERLOAD_IRON).toBeLessThan(ADVANCED_IRONWORKS_IRON_PER_DAY);
    expect(CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL).toBeLessThan(CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY);
    expect(CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL).toBeLessThan(ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY);
  });

  it("includes structure upkeep in totals and sends the shared economy snapshot on init/update", () => {
    const source = serverSource();
    expect(source).toContain("foodStructureUpkeep += economicStructureFoodUpkeepPerInterval(structure.type, player.id) / 10;");
    expect(source).toContain("goldStructureUpkeep += economicStructureGoldUpkeepPerInterval(structure.type) / 10;");
    expect(source).toContain("const economicStructureFoodUpkeepPerInterval = (structureType: EconomicStructureType, playerId: string): number =>");
    expect(source).toContain("const tileUpkeepEntriesForTile = (tileKey: TileKey, ownerId: string | undefined): NonNullable<Tile[\"upkeepEntries\"]> => {");
    expect(source).toContain("tile.upkeepEntries = upkeepEntries;");
    expect(source).toContain("economyBreakdown: economy.economyBreakdown");
    expect(source).toContain("upkeepPerMinute: economy.upkeepPerMinute");
    expect(source).toContain("upkeepLastTick: economy.upkeepLastTick");
  });

  it("wires upkeep diagnostics into the economic operations runtime", () => {
    const source = serverSource();
    expect(source).toContain("deps.lastUpkeepByPlayer.set(player.id, diag);");
    expect(source).toContain("const foodUpkeep = economicStructureFoodUpkeepPerInterval(structure.type, player.id);");
    expect(source).toContain("upkeepContributorsForPlayer,");
    expect(source).toContain("lastUpkeepByPlayer,");
    expect(source).toContain("foodUpkeepCoverageByPlayer,");
  });

  it("wires town manpower-gating helpers into the player economy runtime", () => {
    const source = serverSource();
    expect(source).toContain("const townIncomePaused = !townGoldIncomeEnabledForPlayer(player);");
    expect(source).toContain("playerManpowerCap: (player: Player) => playerManpowerCap(player),");
    expect(source).toContain("townGoldIncomeEnabledForPlayer,");
    expect(source).toContain("townFoodUpkeepPerMinute,");
  });

  it("wires ownership state into the player economy runtime for town income summaries", () => {
    const source = serverSource();
    expect(source).toContain("if (deps.ownership.get(town.tileKey) !== player.id || ownershipStateByTile.get(town.tileKey) !== \"SETTLED\") continue;");
    expect(source).toContain("economicStructuresByTile,");
    expect(source).toContain("ownership,");
    expect(source).toContain("ownershipStateByTile,");
  });

  it("keeps towns visible in the gold breakdown when manpower gating pauses their income", () => {
    const source = serverSource();
    expect(source).toContain("const townIncomePaused = !townGoldIncomeEnabledForPlayer(player);");
    expect(source).toContain('setEconomyBreakdownBucket(goldSources, "Towns", 0, {');
    expect(source).toContain('note: `Paused until manpower is full (${Math.round(effectiveManpowerAt(player))}/${Math.round(playerManpowerCap(player))})`');
  });

  it("mirrors synthesizer gold upkeep onto the output-resource tabs", () => {
    const source = serverSource();
    expect(source).toContain('resourceKey: "GOLD"');
    expect(source).toContain('if (entry.label.includes("Fur Synthesizer")) mirrorGoldUpkeep("SUPPLY", entry);');
    expect(source).toContain('else if (entry.label.includes("Ironworks")) mirrorGoldUpkeep("IRON", entry);');
    expect(source).toContain('else if (entry.label.includes("Crystal Synthesizer")) mirrorGoldUpkeep("CRYSTAL", entry);');
  });

  it("labels foundry upkeep explicitly instead of falling back to radar system", () => {
    const source = serverSource();
    expect(source).toContain('if (type === "FOUNDRY") return "Foundry";');
  });

  it("keeps converter structures inactive after upkeep failures until they are manually enabled", () => {
    const source = serverSource();
    expect(source).toContain('if (isConverterStructureType(structure.type) && structure.status === "inactive" && structure.inactiveReason)');
    expect(source).toContain('if (isConverterStructureType(structure.type)) structure.inactiveReason = "upkeep";');
    expect(source).toContain('const trySetConverterStructureEnabled = (actor: Player, x: number, y: number, enabled: boolean)');
  });

  it("sends per-player leaderboard snapshots on init/update and includes self progress for every victory path", () => {
    const source = serverSource();
    expect(source).toContain("leaderboard: leaderboardSnapshotForPlayer(p.id)");
    expect(source).toContain("leaderboard: leaderboardSnapshotForPlayer(player.id)");
    expect(source).toContain("if (objective.leaderPlayerId === playerId) return objective;");
    expect(source).toContain('if (objectiveId === "TOWN_CONTROL") return `${metric.controlledTowns}/${townTarget} towns`;');
    expect(source).toContain('if (objectiveId === "SETTLED_TERRITORY") return `${metric.settledTiles}/${settledTarget} settled land`;');
    expect(source).toContain('if (objectiveId === "ECONOMIC_HEGEMONY") return `${metric.incomePerMinute.toFixed(1)} gold/m`;');
    expect(source).toContain('if (objectiveId === "RESOURCE_MONOPOLY") {');
    expect(source).toContain('weakest island ${bestPct}% (${bestWeakestQualifiedOwned}/${bestWeakestQualifiedTotal})');
    expect(source).toContain("const seasonVictoryObjectivesForPlayer =");
    expect(source).toContain("const selfProgressLabel = seasonVictorySelfProgressLabel(playerId, objective.id");
    expect(source).toContain("return selfProgressLabel ? { ...objective, selfProgressLabel } : objective;");
  });
});
