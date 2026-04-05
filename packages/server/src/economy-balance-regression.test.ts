import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
};

describe("economy balance regression guard", () => {
  it("keeps the reduced base gold values for towns and docks", () => {
    const source = serverSource();
    expect(source).toContain("const TOWN_BASE_GOLD_PER_MIN = 2;");
    expect(source).toContain("const DOCK_INCOME_PER_MIN = 0.5;");
  });

  it("keeps synth overload on a 24 hour downtime and includes converter output in strategic income", () => {
    const source = serverSource();
    expect(source).toContain("const SYNTH_OVERLOAD_DISABLE_MS = 24 * 60 * 60_000;");
    expect(source).toContain("const output = converterStructureOutputFor(structure.type) ?? {};");
  });

  it("includes structure upkeep in totals and sends the shared economy snapshot on init/update", () => {
    const source = serverSource();
    expect(source).toContain("goldStructureUpkeep += economicStructureGoldUpkeepPerInterval(structure.type) / 10;");
    expect(source).toContain("crystalStructureUpkeep += economicStructureCrystalUpkeepPerInterval(structure.type, player.id) / 10;");
    expect(source).toContain("economyBreakdown: economy.economyBreakdown");
    expect(source).toContain("upkeepPerMinute: economy.upkeepPerMinute");
    expect(source).toContain("upkeepLastTick: economy.upkeepLastTick");
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

  it("reports continental footprint using the weakest qualifying island and a per-player comparison line", () => {
    const source = serverSource();
    expect(source).toContain('weakest island ${bestPct}% (${bestWeakestQualifiedOwned}/${bestWeakestQualifiedTotal})');
    expect(source).toContain("const seasonVictoryObjectivesForPlayer =");
    expect(source).toContain("selfProgressLabel");
  });
});
