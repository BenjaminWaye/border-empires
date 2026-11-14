import { describe, expect, it, vi } from "vitest";
import type { ResourceSupplyAgreement } from "@border-empires/shared";

import { buildPlayer } from "../runtime/runtime.test-helpers.js";
import { aggregatePersonalActivity } from "../personal-activity-aggregation/personal-activity-aggregation.js";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";
import { RuntimeResourceSupply } from "./runtime-resource-supply.js";
import { supplyEndedImpacts } from "./supply-ended-impacts.js";

// Persona playtest (strategist): Hugo's 2-food supply stopped overnight with
// no Chronicle entry; the newest town went unfed and the player only found out
// by comparing Economy numbers. Every real end of a deal is now a card for both Houses.
const deal: ResourceSupplyAgreement = { id: "deal", proposerId: "lena", targetId: "hugo", proposerGives: {}, targetGives: { FOOD: 2 }, startedAt: 1, expiresAt: 100 };

const supplyWith = (now: { at: number }, ended: ReturnType<typeof vi.fn>) => new RuntimeResourceSupply({
  now: () => now.at, player: (id) => buildPlayer(id), ownedTiles: () => [],
  physicalUpkeep: () => ({ FOOD: 5, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }),
  tileSettledAtByKey: new Map<string, number>(), beforeChange: () => undefined, invalidate: () => undefined, changed: () => undefined, ended
}, [deal]);

describe("a resource supply deal ending", () => {
  it("reports a cancellation with who cancelled it", () => {
    const ended = vi.fn();
    supplyWith({ at: 10 }, ended).cancel("deal", "hugo");
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: "deal" }), "CANCELLED", "hugo");
  });

  it("reports an attack ending it, naming the attacker", () => {
    const ended = vi.fn();
    expect(supplyWith({ at: 10 }, ended).cancelBetween("lena", "hugo")).toBe(1);
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: "deal" }), "ATTACK", "lena");
  });

  it("reports a deal running out", () => {
    const ended = vi.fn();
    supplyWith({ at: 150 }, ended).ledger.allocation(150);
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ id: "deal" }), "EXPIRED");
  });

  it("does not report a settlement rollback as a deal ending", () => {
    const ended = vi.fn();
    supplyWith({ at: 10 }, ended).cancelRefunded("deal", "lena", "hugo");
    expect(ended).not.toHaveBeenCalled();
  });

  it("becomes a Chronicle card for each House, from its own side of the deal", () => {
    const impacts: PersonalImpactEvent[] = supplyEndedImpacts(deal, "CANCELLED", "hugo", 50);
    const lena = aggregatePersonalActivity("lena", { from: 0, to: 100 }, [], [], impacts);
    expect(lena.cards).toEqual([expect.objectContaining({ kind: "SUPPLY_ENDED", counterpartyPlayerId: "hugo", reason: "CANCELLED", byPlayerId: "hugo", youGave: {}, youGot: { FOOD: 2 } })]);
    const hugo = aggregatePersonalActivity("hugo", { from: 0, to: 100 }, [], [], impacts);
    expect(hugo.cards).toEqual([expect.objectContaining({ kind: "SUPPLY_ENDED", counterpartyPlayerId: "lena", youGave: { FOOD: 2 }, youGot: {} })]);
  });
});
