import { describe, expect, it } from "vitest";
import { HILLS_DEFENSE_MULT, RIVER_CROSSING_ATTACK_MULT } from "@border-empires/shared";
import { buildAttackPreviewResponse } from "./attack-preview.js";

const tiles = [{ x: 0, y: 0, ownerId: "p", ownershipState: "SETTLED" }, { x: 1, y: 0, ownerId: "q", ownershipState: "SETTLED" }];
const summary = async () => ({ techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 1, umbrite: 1 } });
const preview = (extra: Record<string, unknown>) =>
  buildAttackPreviewResponse("p", { tiles, player: { techIds: [], domainIds: [] } }, () => undefined, summary, { fromX: 0, fromY: 0, toX: 1, toY: 0, ...extra });
const labels = (side: unknown): string[] => ((side as { battle: { label: string }[] }).battle).map((entry) => entry.label);

describe("attack preview terrain terms", () => {
  it("applies the client's hills and river facts to the odds and breakdown", async () => {
    const flat = await preview({});
    const terrain = await preview({ hillsDefense: true, riverCrossing: true });
    expect(terrain.defMult).toBeCloseTo(Number(flat.defMult) * HILLS_DEFENSE_MULT);
    expect(terrain.atkMult).toBeCloseTo(Number(flat.atkMult) * RIVER_CROSSING_ATTACK_MULT);
    expect(Number(terrain.winChance)).toBeLessThan(Number(flat.winChance));
    expect(labels(terrain.defender)).toContain("Hills");
    expect(labels(terrain.attacker)).toContain("River crossing");
    expect(labels(flat.defender)).not.toContain("Hills");
    expect(labels(flat.attacker)).not.toContain("River crossing");
  });

  it("ignores a river fact on a March To preview (the target doesn't border the origin)", async () => {
    const march = await preview({ march: true, riverCrossing: true, hillsDefense: true });
    expect(labels(march.attacker)).not.toContain("River crossing");
    expect(labels(march.defender)).toContain("Hills");
  });
});
