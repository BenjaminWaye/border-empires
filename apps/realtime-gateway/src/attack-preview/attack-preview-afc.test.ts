import { describe, expect, it, vi } from "vitest";
import type { AfcCombatFacts } from "@border-empires/sim-protocol";
import { attackPreviewResult, buildAttackPreviewResponse } from "./attack-preview.js";

const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
const tiles = [
  { x: 0, y: 0, ownerId: "p", ownershipState: "SETTLED", musterJson: JSON.stringify({ ownerId: "p", momentum: { stacks: 3, decayAt: Date.now() + 100_000 } }) },
  { x: 1, y: 0, ownerId: "e", ownershipState: "SETTLED", townType: "MARKET", fortJson: JSON.stringify({ ownerId: "e", variant: "FORT", status: "active", wardEnabled: true, wardRechargesAt: 0, attackCommitmentMult: 2 }) }
];
const facts = (ready: boolean): AfcCombatFacts => ({ factoryEquivalents: { titanium: 3, umbrite: 2 }, coalitionTargetIds: ["e"], targetFortWardReady: ready });
describe("authoritative AFC attack previews", () => {
  it("shows zero capture chance for a ready ward, but uses the live power check over stale tile metadata", async () => {
    const preview = (ready: boolean) => attackPreviewResult("p", tiles, undefined, message, [], ["afc-vanguard-4"], async () => ({ techIds: [], domainIds: ["afc-bastion-5"] }), undefined, async () => facts(ready));
    expect(await preview(true)).toMatchObject({ winChance: 0, fortWardReady: true, requiredMuster: 300 });
    const unpowered = await preview(false);
    expect(unpowered.fortWardReady).toBe(false); expect(unpowered.winChance).toBeGreaterThan(0);
  });
  it("combines flag Momentum and one coalition bonus in the same attack multiplier", async () => {
    const base = await attackPreviewResult("p", tiles, undefined, message, [], [], undefined, undefined, async () => ({ ...facts(false), coalitionTargetIds: [] }));
    const boosted = await attackPreviewResult("p", tiles, undefined, message, [], ["afc-vanguard-3", "afc-chancery-3"], undefined, undefined, async () => facts(false));
    expect(boosted.atkMult).toBeCloseTo(Number(base.atkMult) * 1.15 * 1.15);
  });
  it("requests the target-specific ward power check once per player from the simulation", async () => {
    const lookup = vi.fn(async () => ({ techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 0, umbrite: 0 }, afcCombatFacts: facts(false) }));
    await buildAttackPreviewResponse("p", { tiles, player: { techIds: [], domainIds: [] } }, () => undefined, lookup, message);
    expect(lookup).toHaveBeenCalledWith("e", { x: 1, y: 0 });
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
