import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";

import { addStrategicResource, spendStrategicResource, strategicResourceAmount } from "./runtime-strategic-resource-ledger.js";

const player = (strategicResources: Partial<Record<"TITANIUM" | "CRYSTAL", number>> = {}): DomainPlayer =>
  ({ strategicResources } as unknown as DomainPlayer);

describe("runtime-strategic-resource-ledger", () => {
  it("reads zero for an unset resource", () => {
    expect(strategicResourceAmount(player(), "TITANIUM")).toBe(0);
  });

  it("spends when sufficient, floors at zero", () => {
    const p = player({ TITANIUM: 10 });
    expect(spendStrategicResource(p, "TITANIUM", 4)).toBe(true);
    expect(strategicResourceAmount(p, "TITANIUM")).toBe(6);
  });

  it("refuses to spend more than available", () => {
    const p = player({ TITANIUM: 3 });
    expect(spendStrategicResource(p, "TITANIUM", 4)).toBe(false);
    expect(strategicResourceAmount(p, "TITANIUM")).toBe(3);
  });

  it("adds to the existing amount", () => {
    const p = player({ CRYSTAL: 2 });
    addStrategicResource(p, "CRYSTAL", 5);
    expect(strategicResourceAmount(p, "CRYSTAL")).toBe(7);
  });
});
