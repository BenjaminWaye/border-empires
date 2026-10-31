import { expect, it, vi } from "vitest";
import { buildAttackPreviewResponse } from "./attack-preview.js";

it("uses authoritative relic factors for an offline defender and reuses each target-specific lookup", async () => {
  const tiles = [{ x: 0, y: 0, ownerId: "p", ownershipState: "SETTLED", dockId: "dock" }, { x: 1, y: 0, ownerId: "q", ownershipState: "SETTLED" }];
  const message = { fromX: 0, fromY: 0, toX: 1, toY: 0 };
  const plain = vi.fn(async () => ({ techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 1, umbrite: 1 } }));
  const base = await buildAttackPreviewResponse("p", { tiles, player: { techIds: [], domainIds: [] } }, () => undefined, plain, message);
  const relics = vi.fn(async (id: string) => ({ techIds: [], domainIds: [], weaponsFactoryCounts: { titanium: 1, umbrite: 1 }, relicCombatFacts: { attackMultiplier: id === "p" ? 1.5 : 1, defenseMultiplier: id === "q" ? 1.5 : 1, dockAttackMultiplier: id === "p" ? 1.15 : 1 } }));
  const boosted = await buildAttackPreviewResponse("p", { tiles, player: { techIds: [], domainIds: [] } }, () => undefined, relics, message);
  expect(boosted.atkMult).toBeCloseTo(Number(base.atkMult) * 1.5 * 1.15);
  expect(boosted.defMult).toBeCloseTo(Number(base.defMult) * 1.5);
  expect(relics).toHaveBeenCalledTimes(2); expect(relics).toHaveBeenCalledWith("q", { x: 1, y: 0 });
});
