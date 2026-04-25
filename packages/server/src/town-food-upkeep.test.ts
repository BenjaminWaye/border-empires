import { describe, expect, it } from "vitest";

const readServerSource = async (): Promise<string> => {
  const mod = await import("./server-town-economy-runtime.js");
  return String(mod.createServerTownEconomyRuntime);
};

describe("town food upkeep regression guard", () => {
  it("keeps settlement-flagged towns at zero food upkeep even after they would otherwise tier up", async () => {
    const source = await readServerSource();
    expect(source).toContain("if (town.isSettlement) return 0;");
    expect(source).toContain('if (tier === "SETTLEMENT") return 0;');
  });
});
