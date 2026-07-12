import { describe, expect, it } from "vitest";

import { InMemoryGalaxyEndorsementStore } from "./galaxy-endorsement-store.js";

describe("InMemoryGalaxyEndorsementStore", () => {
  it("returns undefined for an unknown ended season id", async () => {
    const store = new InMemoryGalaxyEndorsementStore();
    expect(await store.getByEndedSeasonId("nope")).toBeUndefined();
  });

  it("upserts a fresh endorsement, preserving createdAt across updates", async () => {
    let now = 1_000;
    const store = new InMemoryGalaxyEndorsementStore(() => now);

    const first = await store.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-a" });
    expect(first).toEqual({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-a", createdAt: 1_000 });

    now = 2_000;
    const second = await store.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-b" });
    expect(second).toEqual({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-b", createdAt: 1_000 });
  });

  it("marks an endorsement applied and preserves that across a later upsert", async () => {
    const store = new InMemoryGalaxyEndorsementStore(() => 1_000);
    await store.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-a" });
    await store.markApplied("season-1");

    const applied = await store.getByEndedSeasonId("season-1");
    expect(applied?.appliedAt).toBe(1_000);

    const updated = await store.upsert({ endedSeasonId: "season-1", emperorPlayerId: "emperor-1", targetPlayerId: "target-b" });
    expect(updated.appliedAt).toBe(1_000);
  });

  it("markApplied on an unknown season id is a no-op", async () => {
    const store = new InMemoryGalaxyEndorsementStore();
    await expect(store.markApplied("nope")).resolves.toBeUndefined();
  });
});
