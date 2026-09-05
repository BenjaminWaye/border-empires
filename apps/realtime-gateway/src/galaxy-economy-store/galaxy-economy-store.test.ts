import { describe, expect, it } from "vitest";

import { InMemoryGalaxyEconomyStore } from "./galaxy-economy-store.js";

describe("InMemoryGalaxyEconomyStore", () => {
  it("round-trips a balance by authUid, allowing negative Influence", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.upsertBalance({ authUid: "uid-1", influence: -12, production: 40, lastCycleAt: 1_000 });

    await expect(store.getBalance("uid-1")).resolves.toEqual({ authUid: "uid-1", influence: -12, production: 40, lastCycleAt: 1_000 });
    await expect(store.getBalance("uid-missing")).resolves.toBeUndefined();
  });

  it("lists every balance for the Cycle scheduler to iterate", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.upsertBalance({ authUid: "uid-1", influence: 1, production: 1, lastCycleAt: 1 });
    await store.upsertBalance({ authUid: "uid-2", influence: 2, production: 2, lastCycleAt: 2 });

    const all = await store.getAllBalances();
    expect(all.map((b) => b.authUid).sort()).toEqual(["uid-1", "uid-2"]);
  });

  it("ensureStability creates a new territory at 100 and is idempotent", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    const first = await store.ensureStability({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET" });
    expect(first).toEqual({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET", stability: 100, garrison: 0 });

    await store.setStability("uid-1", "season-1", 42);
    const second = await store.ensureStability({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET" });
    expect(second.stability).toBe(42);
  });

  it("getStabilityForOwner returns only that owner's territories", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.ensureStability({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET" });
    await store.ensureStability({ authUid: "uid-1", seasonId: "season-2", tier: "OUTPOST" });
    await store.ensureStability({ authUid: "uid-2", seasonId: "season-3", tier: "PLANET" });

    const owned = await store.getStabilityForOwner("uid-1");
    expect(owned.map((r) => r.seasonId).sort()).toEqual(["season-1", "season-2"]);
  });

  it("setStability is a no-op for a territory that was never ensured", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.setStability("uid-1", "season-1", 50);
    await expect(store.getStability("uid-1", "season-1")).resolves.toBeUndefined();
  });

  it("addGarrison accumulates across multiple deposits", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.ensureStability({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET" });
    await store.addGarrison("uid-1", "season-1", 100);
    await store.addGarrison("uid-1", "season-1", 50);
    await expect(store.getStability("uid-1", "season-1")).resolves.toMatchObject({ garrison: 150 });
  });

  it("addGarrison is a no-op for a territory that was never ensured", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.addGarrison("uid-1", "season-1", 100);
    await expect(store.getStability("uid-1", "season-1")).resolves.toBeUndefined();
  });

  it("resetGarrison zeroes an existing territory's Garrison", async () => {
    const store = new InMemoryGalaxyEconomyStore();
    await store.ensureStability({ authUid: "uid-1", seasonId: "season-1", tier: "PLANET" });
    await store.addGarrison("uid-1", "season-1", 200);
    await store.resetGarrison("uid-1", "season-1");
    await expect(store.getStability("uid-1", "season-1")).resolves.toMatchObject({ garrison: 0 });
  });
});
