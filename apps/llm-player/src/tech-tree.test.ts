import { describe, expect, it } from "vitest";
import { reachableTechChoices } from "./tech-tree.js";

describe("reachableTechChoices", () => {
  it("includes a root tech (no prereqs) when nothing is owned yet", () => {
    const choices = reachableTechChoices([]);
    expect(choices.find((choice) => choice.id === "agriculture")).toBeDefined();
  });

  it("excludes a tech gated by a single unmet prereq (requires)", () => {
    // mining requires agriculture (packages/game-domain/data/tech-tree.json)
    const choices = reachableTechChoices([]);
    expect(choices.find((choice) => choice.id === "mining")).toBeUndefined();
  });

  it("includes a tech once its single prereq is owned", () => {
    const choices = reachableTechChoices(["agriculture"]);
    expect(choices.find((choice) => choice.id === "mining")).toBeDefined();
  });

  it("excludes a tech with multiple prereqs (prereqIds) until all are owned", () => {
    // aeronautics uses prereqIds (multi-prereq) per tech-tree.json
    const partial = reachableTechChoices([]);
    expect(partial.find((choice) => choice.id === "aeronautics")).toBeUndefined();
  });

  it("excludes an already-owned tech", () => {
    const choices = reachableTechChoices(["agriculture"]);
    expect(choices.find((choice) => choice.id === "agriculture")).toBeUndefined();
  });

  it("returns the same escalating gold cost for every reachable choice, based on researched count", () => {
    const zeroOwned = reachableTechChoices([]);
    const oneOwned = reachableTechChoices(["agriculture"]);
    expect(new Set(zeroOwned.map((choice) => choice.goldCost)).size).toBe(1);
    expect(oneOwned[0]?.goldCost).toBeGreaterThan(zeroOwned[0]?.goldCost ?? 0);
  });

  // Monument-unlock techs are excluded unconditionally: none of their
  // effects (a monument, the Aether Tower, an aether ability) are usable by
  // this bot's tool surface, and the server-side "already claimed by another
  // player" exclusion (buildTechUpdatePayload's claimedMonumentUnlockTechIds)
  // can't be verified client-side at all (fog of war hides rivals' tiles).
  it("excludes a monument-unlock tech even once its own prereq is met", () => {
    // urban-mintworks (Imperial Exchange's unlock tech) requires coinage.
    const choices = reachableTechChoices(["coinage"]);
    expect(choices.find((choice) => choice.id === "urban-mintworks")).toBeUndefined();
  });
});
