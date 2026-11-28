import { describe, expect, test } from "vitest";
import { ciede2000, defaultHouseCrestFor, isEmpireColorFarEnough } from "@border-empires/shared";
import { BASE_PALETTE } from "../player-color-allocation/player-color-allocation.js";
import { assignAiColors } from "../player-color-allocation/ai-color-assignment.js";
import { colorBlindSafeDistance } from "../player-color-allocation/perceptual-color-distance.js";
import { seedAiColors } from "./seed-ai-colors.js";

// Owner report 2026-11-27: an AI changed colour mid-game. The gateway
// re-derived every AI colour on each boot, so a deploy repainted AIs.

const AI_IDS = Array.from({ length: 20 }, (_, i) => `ai-${i + 1}`);

const boot = async (
  ids: readonly string[],
  stored: ReadonlyMap<string, string>,
  humans: ReadonlySet<string> = new Set()
): Promise<Map<string, string>> => {
  const saved = new Map<string, string>();
  await seedAiColors(new Set(ids), async (id, color) => void saved.set(id, color), defaultHouseCrestFor, humans, stored);
  return saved;
};

describe("AI colours stay put across gateway restarts", () => {
  test("a new human colour does not repaint AIs whose colours are still far enough from it", async () => {
    const firstBoot = await boot(AI_IDS, new Map());
    // A human colour far from every AI, which would still reshuffle a fresh derivation.
    const human = BASE_PALETTE.find(
      (hex) =>
        isEmpireColorFarEnough(hex, firstBoot.values()) &&
        [...assignAiColors(AI_IDS, defaultHouseCrestFor, new Set([hex]))].some(([id, color]) => firstBoot.get(id) !== color)
    );
    expect(human).toBeDefined();
    const secondBoot = await boot(AI_IDS, firstBoot, new Set([human!]));
    expect([...secondBoot.entries()].sort()).toEqual([...firstBoot.entries()].sort());
  });

  test("only the AI whose stored colour is exactly a human's colour gets a new colour", async () => {
    const firstBoot = await boot(AI_IDS, new Map());
    const clashing = firstBoot.get("ai-7")!;
    const secondBoot = await boot(AI_IDS, firstBoot, new Set([clashing]));
    expect(secondBoot.get("ai-7")).not.toBe(clashing);
    expect(isEmpireColorFarEnough(secondBoot.get("ai-7")!, [clashing])).toBe(true);
    for (const id of AI_IDS) if (id !== "ai-7") expect(secondBoot.get(id)).toBe(firstBoot.get(id));
  });

  test("an AI added later gets a colour without moving the others", async () => {
    const firstBoot = await boot(AI_IDS.slice(0, 19), new Map());
    const secondBoot = await boot(AI_IDS, firstBoot);
    for (const id of AI_IDS.slice(0, 19)) expect(secondBoot.get(id)).toBe(firstBoot.get(id));
    expect(isEmpireColorFarEnough(secondBoot.get("ai-20")!, firstBoot.values())).toBe(true);
  });

  test("a reserved stored colour (barbarian grey) is replaced", async () => {
    const secondBoot = await boot(["ai-1"], new Map([["ai-1", "#2f3842"]]));
    expect(secondBoot.get("ai-1")).not.toBe("#2f3842");
  });

  // PR #3051 review findings.
  test("a stored colour outside today's palette is kept, so palette edits do not repaint AIs", async () => {
    const secondBoot = await boot(["ai-1"], new Map([["ai-1", "#c2457a"]]));
    expect(secondBoot.get("ai-1")).toBe("#c2457a");
  });

  test("a human near (not on) an AI's colour does not repaint it, e.g. a player back from a long break", async () => {
    const firstBoot = await boot(AI_IDS, new Map());
    const alden = firstBoot.get("ai-1")!;
    // Nudge one channel: a different colour, but well under the distance floor.
    const near = `#${alden.slice(1, 5)}${((parseInt(alden.slice(5, 7), 16) + 3) % 256).toString(16).padStart(2, "0")}`;
    expect(near).not.toBe(alden);
    expect(ciede2000(near, alden)).toBeLessThan(15);
    const secondBoot = await boot(AI_IDS, firstBoot, new Set([near]));
    expect(secondBoot.get("ai-1")).toBe(alden);
  });

  test("a crowded 60-AI sector keeps every colour across a restart with a new human", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `ai-${i + 1}`);
    const firstBoot = await boot(ids, new Map());
    const human = BASE_PALETTE.find((hex) => ![...firstBoot.values()].includes(hex))!;
    const secondBoot = await boot(ids, firstBoot, new Set([human]));
    expect([...secondBoot.entries()].sort()).toEqual([...firstBoot.entries()].sort());
  });

  test("an AI added later still gets the same-crest spacing from a kept AI", async () => {
    // Without the kept AIs' emblem marks, a late AI took a colour 0.061 from one sharing its mark.
    expect(defaultHouseCrestFor("ai-1")).toBe(defaultHouseCrestFor("ai-13"));
    const firstBoot = await boot(AI_IDS.filter((id) => id !== "ai-13"), new Map());
    const secondBoot = await boot(AI_IDS, firstBoot);
    expect(colorBlindSafeDistance(secondBoot.get("ai-1")!, secondBoot.get("ai-13")!)).toBeGreaterThan(0.08);
  });
});
