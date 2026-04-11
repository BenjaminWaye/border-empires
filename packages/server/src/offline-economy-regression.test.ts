import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readLocal = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("offline economy regression guard", () => {
  it("keeps passive income ticking after inactivity while pausing upkeep", () => {
    const source = readLocal("./main.ts");
    expect(source).toContain("const offlineUpkeepPausedForPlayer = (player: Player): boolean => now() - lastEconomyActivityAtForPlayer(player) > OFFLINE_YIELD_ACCUM_MAX_MS;");
    expect(source).toContain("const upkeepPaused = offlineUpkeepPausedForPlayer(p);");
    expect(source).toContain("accumulatePassiveIncomeForPlayer(p);");
    expect(source).not.toContain("if (now() - p.lastActiveAt > OFFLINE_YIELD_ACCUM_MAX_MS) {");
  });

  it("keeps town population growth ticking after inactivity even when upkeep is paused", () => {
    const source = readLocal("./main.ts");
    const tickLoopIndex = source.indexOf("for (const p of players.values()) {");
    const populationIndex = source.indexOf("const populationTouched = updateTownPopulationForPlayer(p);", tickLoopIndex);
    const upkeepGateIndex = source.indexOf("if (!upkeepPaused) {", tickLoopIndex);
    expect(tickLoopIndex).toBeGreaterThan(-1);
    expect(populationIndex).toBeGreaterThan(-1);
    expect(upkeepGateIndex).toBeGreaterThan(-1);
    expect(populationIndex).toBeLessThan(upkeepGateIndex);
  });

  it("wakes offline upkeep again when a player loses territory", () => {
    const source = readLocal("./main.ts");
    expect(source).toContain("const wakeOfflineEconomyForPlayer = (playerId: string | undefined): void => {");
    expect(source).toContain("player.lastEconomyWakeAt = now();");
    expect(source).toContain("wakeOfflineEconomyForPlayer(oldOwner);");
  });

  it("persists the offline economy wake timestamp on players", () => {
    const sharedTypes = readLocal("../../shared/src/types.ts");
    expect(sharedTypes).toContain("lastEconomyWakeAt?: number;");
  });
});
