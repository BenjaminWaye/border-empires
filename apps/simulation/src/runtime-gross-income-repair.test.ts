import { describe, expect, it } from "vitest";
import { repairZeroGrossIncomeSettlements } from "./runtime-gross-income-repair.js";
import { createAiRuntimePlayer, createHumanRuntimePlayer } from "./runtime-player-factory.js";
import type { RuntimePlayer } from "./runtime-types.js";

// Regression coverage for the "AI 6"-"AI 20" frozen-player bug: player
// records with an "ai-<n>" id that own territory but are missing (or were
// previously reconstructed with isAi: false) from the runtime's live player
// map must come back out of repair as isAi: true and be reported in
// aiPlayerIds, or the autopilot tick loop silently excludes them forever.
describe("repairZeroGrossIncomeSettlements", () => {
  const alwaysEnsureSettled = () => true;

  it("reconstructs a missing ai-<n> player as AI, not human", () => {
    const players = new Map<string, RuntimePlayer>();
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: (playerId) => playerId === "ai-10",
        ensureGrossIncomeSettlementForPlayer: alwaysEnsureSettled
      },
      ["ai-10"]
    );
    expect(players.get("ai-10")?.isAi).toBe(true);
    expect(result.aiPlayerIds).toEqual(["ai-10"]);
    expect(result.repaired).toBe(1);
  });

  it("self-heals an existing ai-<n> player that was previously mis-repaired as isAi: false, without resetting its state", () => {
    const stub: RuntimePlayer = { ...createHumanRuntimePlayer("ai-6"), points: 4 };
    const players = new Map<string, RuntimePlayer>([["ai-6", stub]]);
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: () => true,
        ensureGrossIncomeSettlementForPlayer: () => false
      },
      ["ai-6"]
    );
    const healed = players.get("ai-6");
    expect(healed?.isAi).toBe(true);
    expect(healed?.points).toBe(4);
    expect(result.aiPlayerIds).toEqual(["ai-6"]);
  });

  it("does not create a player record for an ai-<n> id with no territory", () => {
    const players = new Map<string, RuntimePlayer>();
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: () => false,
        ensureGrossIncomeSettlementForPlayer: alwaysEnsureSettled
      },
      ["ai-16"]
    );
    expect(players.has("ai-16")).toBe(false);
    expect(result.aiPlayerIds).toEqual([]);
    expect(result.repaired).toBe(0);
  });

  it("still reconstructs missing non-ai ids as human players (existing behavior preserved)", () => {
    const players = new Map<string, RuntimePlayer>();
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: () => true,
        ensureGrossIncomeSettlementForPlayer: alwaysEnsureSettled
      },
      ["player-1"]
    );
    expect(players.get("player-1")?.isAi).toBe(false);
    expect(result.aiPlayerIds).toEqual([]);
    expect(result.repaired).toBe(1);
  });

  it("leaves an already-correct AI player alone and still reports it", () => {
    const genuine = createAiRuntimePlayer("ai-4");
    const players = new Map<string, RuntimePlayer>([["ai-4", genuine]]);
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: () => true,
        ensureGrossIncomeSettlementForPlayer: () => false
      },
      ["ai-4"]
    );
    expect(players.get("ai-4")).toBe(genuine);
    expect(result.aiPlayerIds).toEqual(["ai-4"]);
  });

  it("dedupes repeated ids in the input iterable", () => {
    const players = new Map<string, RuntimePlayer>();
    const result = repairZeroGrossIncomeSettlements(
      {
        players,
        hasTerritory: () => true,
        ensureGrossIncomeSettlementForPlayer: alwaysEnsureSettled
      },
      ["ai-7", "ai-7", "ai-7"]
    );
    expect(result.repaired).toBe(1);
    expect(result.aiPlayerIds).toEqual(["ai-7"]);
  });
});
