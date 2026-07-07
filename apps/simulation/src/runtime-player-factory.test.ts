import { describe, expect, it } from "vitest";
import { createAiRuntimePlayer, createHumanRuntimePlayer, isAiPlayerId } from "./runtime-player-factory.js";

describe("isAiPlayerId", () => {
  it("matches the worldgen ai-<n> naming convention", () => {
    expect(isAiPlayerId("ai-1")).toBe(true);
    expect(isAiPlayerId("ai-20")).toBe(true);
    expect(isAiPlayerId("ai-137")).toBe(true);
  });

  it("does not match human, barbarian, or non-numeric-suffix ids", () => {
    expect(isAiPlayerId("player-1")).toBe(false);
    expect(isAiPlayerId("barbarian-1")).toBe(false);
    expect(isAiPlayerId("orz1OiQwxGS5LKwcAwG5wzNCd3P2")).toBe(false);
    expect(isAiPlayerId("ai-")).toBe(false);
    expect(isAiPlayerId("ai-abc")).toBe(false);
  });
});

describe("createAiRuntimePlayer", () => {
  it("produces a player with isAi: true and every other default field intact", () => {
    const humanShape = createHumanRuntimePlayer("ai-6");
    const aiPlayer = createAiRuntimePlayer("ai-6");
    expect(aiPlayer.isAi).toBe(true);
    expect(aiPlayer.id).toBe("ai-6");
    expect(aiPlayer.points).toBe(humanShape.points);
    expect(aiPlayer.manpower).toBe(humanShape.manpower);
    expect(aiPlayer.strategicResources).toEqual(humanShape.strategicResources);
  });
});
