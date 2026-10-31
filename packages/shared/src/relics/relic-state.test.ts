import { describe, expect, it } from "vitest";
import { createRelicState, consumeRelicUse, relicOperationalState, relicRemainingUses } from "./relic-state.js";
import { selectRelicResource, type RelicResourceSupply } from "./relic-resource-reward.js";

describe("finite relic lifecycle", () => {
  it("consumes exactly 100 deployments and keeps explicit depletion across JSON recovery", () => {
    let state = createRelicState("WARPRESS");
    for (let i = 0; i < 100; i += 1) {
      const result = consumeRelicUse(state);
      expect(result.consumed).toBe(true);
      state = result.state;
    }
    const restored: typeof state = JSON.parse(JSON.stringify(state));
    expect(relicRemainingUses(restored)).toBe(0);
    expect(consumeRelicUse(restored).consumed).toBe(false);
    expect(relicOperationalState(restored, false)).toBe("depleted");
    expect(relicOperationalState(restored, true)).toBe("depleted");
  });
  it("does not reset reserve when losing and regaining the garrison", () => {
    const state = consumeRelicUse(createRelicState("QUICKFORGE")).state;
    expect(relicOperationalState(state, false)).toBe("dormant");
    expect(relicOperationalState(state, true)).toBe("active");
    expect(relicRemainingUses(state)).toBe(4);
  });
  it("never depletes an unlimited installation and does not migrate legacy worlds implicitly", () => {
    expect(relicRemainingUses(createRelicState("CALCULATING_ENGINE"))).toBeUndefined();
    expect(consumeRelicUse({ type: "WARPRESS" }).consumed).toBe(false);
    expect(relicRemainingUses({ type: "QUICKFORGE", remainingUses: 0 })).toBeUndefined();
  });
  it("fails closed for corrupt counters and clamps to the actual capacity", () => {
    expect(relicRemainingUses({ ...createRelicState("WARPRESS"), remainingUses: NaN })).toBe(0);
    expect(relicRemainingUses({ ...createRelicState("WARPRESS"), remainingUses: -5 })).toBe(0);
    expect(relicRemainingUses({ ...createRelicState("WARPRESS"), remainingUses: 500 })).toBe(100);
  });
});

describe("reclamation allocation", () => {
  const totals: RelicResourceSupply = { TITANIUM: { supply: 20, demand: 1 }, CRYSTAL: { supply: 1, demand: 10 }, UMBRITE: { supply: 0, demand: 10 } };
  it("never selects a hidden resource even if it is the scarcest", () => {
    for (let i = 0; i < 100; i += 1) expect(selectRelicResource(new Set(["TITANIUM", "CRYSTAL"]), totals, i / 100)).not.toBe("UMBRITE");
    expect(selectRelicResource(new Set(), totals, 0.5)).toBeUndefined();
  });
  it("favors the shortage while allowing a deterministic reproducible draw", () => {
    const revealed = new Set<"TITANIUM" | "CRYSTAL">(["TITANIUM", "CRYSTAL"]);
    const results = Array.from({ length: 100 }, (_, i) => selectRelicResource(revealed, totals, i / 100));
    expect(results.filter((value) => value === "CRYSTAL").length).toBeGreaterThan(90);
    expect(selectRelicResource(revealed, totals, 0.6)).toBe(selectRelicResource(revealed, totals, 0.6));
  });
});
