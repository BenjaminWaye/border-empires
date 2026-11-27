import { describe, expect, test } from "vitest";
import { aiDisplayNameForId, isEmpireColorFarEnough } from "@border-empires/shared";
import { BASE_PALETTE } from "../player-color-allocation/player-color-allocation.js";
import { assignAiColors } from "../player-color-allocation/ai-color-assignment.js";
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
  await seedAiColors(new Set(ids), async (id, color) => void saved.set(id, color), aiDisplayNameForId, humans, async (id) => stored.get(id));
  return saved;
};

describe("AI colours stay put across gateway restarts", () => {
  test("a new human colour does not repaint AIs whose colours are still far enough from it", async () => {
    const firstBoot = await boot(AI_IDS, new Map());
    // A human colour far from every AI, which would still reshuffle a fresh derivation.
    const human = BASE_PALETTE.find(
      (hex) =>
        isEmpireColorFarEnough(hex, firstBoot.values()) &&
        [...assignAiColors(AI_IDS, aiDisplayNameForId, new Set([hex]))].some(([id, color]) => firstBoot.get(id) !== color)
    );
    expect(human).toBeDefined();
    const secondBoot = await boot(AI_IDS, firstBoot, new Set([human!]));
    expect([...secondBoot.entries()].sort()).toEqual([...firstBoot.entries()].sort());
  });

  test("only the AI whose stored colour now clashes with a human gets a new colour", async () => {
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

  test("a stored colour that is not a valid AI colour (old hash colour) is replaced", async () => {
    const secondBoot = await boot(["ai-1"], new Map([["ai-1", "#2f3842"]]));
    expect(secondBoot.get("ai-1")).not.toBe("#2f3842");
  });
});
