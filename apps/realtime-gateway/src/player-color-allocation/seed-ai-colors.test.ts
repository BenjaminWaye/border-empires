import { describe, expect, test } from "vitest";
import { MIN_PERCEPTUAL_GAP, perceptualDistance } from "./perceptual-color-distance.js";
import { seedAiColors } from "./seed-ai-colors.js";

const harness = (humans: Record<string, string>, ais: Record<string, string> = {}) => {
  const stored = new Map<string, string>([...Object.entries(humans), ...Object.entries(ais)]);
  const overrides = new Map<string, { tileColor?: string }>([...stored].map(([id, tileColor]) => [id, { tileColor }]));
  return {
    stored,
    overrides,
    deps: {
      profileStore: {
        listAllNamed: async () => [...stored].map(([playerId, tileColor]) => ({ playerId, tileColor })),
        setTileColor: async (playerId: string, tileColor: string) => { stored.set(playerId, tileColor); }
      },
      profileOverrides: {
        entries: () => overrides.entries(),
        upsert: (playerId: string, patch: { tileColor?: string }) => { overrides.set(playerId, { ...overrides.get(playerId), ...patch }); }
      }
    }
  };
};

describe("seedAiColors", () => {
  test("AIs never land near a human's colour, and humans keep theirs", async () => {
    const h = harness({ "human-1": "#1f77b4", "human-2": "#ff0000" });
    const aiIds = Array.from({ length: 20 }, (_, i) => `ai-${i}`);
    const assigned = await seedAiColors({ aiPlayerIds: aiIds, ...h.deps });
    expect(h.stored.get("human-1")).toBe("#1f77b4");
    expect(h.stored.get("human-2")).toBe("#ff0000");
    for (const color of assigned.values()) {
      expect(perceptualDistance(color, "#1f77b4")).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
      expect(perceptualDistance(color, "#ff0000")).toBeGreaterThanOrEqual(MIN_PERCEPTUAL_GAP);
    }
  });

  test("an AI that held a colour now too close to a human is recoloured and reported", async () => {
    const h = harness({ "human-1": "#0082c8" }, { "ai-1": "#1f77b4" });
    const changed: Array<[string, string]> = [];
    const assigned = await seedAiColors({ aiPlayerIds: ["ai-1"], ...h.deps, onColorChanged: (id, c) => changed.push([id, c]) });
    expect(assigned.get("ai-1")).not.toBe("#1f77b4");
    expect(changed).toEqual([["ai-1", assigned.get("ai-1")!]]);
    expect(h.overrides.get("ai-1")?.tileColor).toBe(assigned.get("ai-1"));
  });

  test("re-seeding with unchanged inputs is stable and reports nothing", async () => {
    const h = harness({ "human-1": "#ff0000" });
    await seedAiColors({ aiPlayerIds: ["ai-1", "ai-2"], ...h.deps });
    const changed: string[] = [];
    await seedAiColors({ aiPlayerIds: ["ai-1", "ai-2"], ...h.deps, onColorChanged: (id) => changed.push(id) });
    expect(changed).toEqual([]);
  });
});
