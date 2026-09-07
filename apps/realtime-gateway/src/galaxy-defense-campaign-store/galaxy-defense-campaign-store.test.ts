import { describe, expect, it } from "vitest";

import { InMemoryGalaxyDefenseCampaignStore } from "./galaxy-defense-campaign-store.js";

describe("InMemoryGalaxyDefenseCampaignStore", () => {
  it("pops the oldest queued entry first (FIFO)", async () => {
    const store = new InMemoryGalaxyDefenseCampaignStore();
    await store.enqueueContested({ targetSeasonId: "season-1", targetAuthUid: "uid-1", queuedAt: 1 });
    await store.enqueueContested({ targetSeasonId: "season-2", targetAuthUid: "uid-2", queuedAt: 2 });

    await expect(store.popOldestContested()).resolves.toMatchObject({ targetSeasonId: "season-1" });
    await expect(store.popOldestContested()).resolves.toMatchObject({ targetSeasonId: "season-2" });
    await expect(store.popOldestContested()).resolves.toBeUndefined();
  });

  it("getQueueLength reflects enqueues and pops", async () => {
    const store = new InMemoryGalaxyDefenseCampaignStore();
    await expect(store.getQueueLength()).resolves.toBe(0);
    await store.enqueueContested({ targetSeasonId: "season-1", targetAuthUid: "uid-1", queuedAt: 1 });
    await expect(store.getQueueLength()).resolves.toBe(1);
    await store.popOldestContested();
    await expect(store.getQueueLength()).resolves.toBe(0);
  });

  it("records and retrieves an ownership transfer by originalSeasonId", async () => {
    const store = new InMemoryGalaxyDefenseCampaignStore();
    await expect(store.getTransferForSeasonId("season-1")).resolves.toBeUndefined();

    await store.recordTransfer({ originalSeasonId: "season-1", currentOwnerAuthUid: "uid-2", transferredAt: 100, wonViaSeasonId: "season-9" });
    await expect(store.getTransferForSeasonId("season-1")).resolves.toEqual({
      originalSeasonId: "season-1",
      currentOwnerAuthUid: "uid-2",
      transferredAt: 100,
      wonViaSeasonId: "season-9"
    });
  });

  it("a later transfer for the same territory overwrites the earlier one (re-contested and won again)", async () => {
    const store = new InMemoryGalaxyDefenseCampaignStore();
    await store.recordTransfer({ originalSeasonId: "season-1", currentOwnerAuthUid: "uid-2", transferredAt: 100, wonViaSeasonId: "season-9" });
    await store.recordTransfer({ originalSeasonId: "season-1", currentOwnerAuthUid: "uid-3", transferredAt: 200, wonViaSeasonId: "season-12" });

    await expect(store.getTransferForSeasonId("season-1")).resolves.toMatchObject({ currentOwnerAuthUid: "uid-3" });
  });

  it("getAllTransfers returns every recorded transfer", async () => {
    const store = new InMemoryGalaxyDefenseCampaignStore();
    await store.recordTransfer({ originalSeasonId: "season-1", currentOwnerAuthUid: "uid-2", transferredAt: 100, wonViaSeasonId: "season-9" });
    await store.recordTransfer({ originalSeasonId: "season-2", currentOwnerAuthUid: "uid-3", transferredAt: 150, wonViaSeasonId: "season-10" });

    const all = await store.getAllTransfers();
    expect(all.map((t) => t.originalSeasonId).sort()).toEqual(["season-1", "season-2"]);
  });
});
