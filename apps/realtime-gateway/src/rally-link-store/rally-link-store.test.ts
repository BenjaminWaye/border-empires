import { describe, expect, it } from "vitest";

import { InMemoryRallyLinkStore } from "./rally-link-store.js";

describe("rally link store", () => {
  it("atomically reserves uses and can refund a non-spawning join", async () => {
    const store = new InMemoryRallyLinkStore();
    await store.create({
      code: "r_one",
      ownerPlayerId: "owner",
      ownerName: "Owner",
      anchor: { x: 1, y: 2, island: "tile:1,2" },
      createdAt: 1_000,
      expiresAt: 10_000,
      maxUses: 1
    });

    expect(await store.consume("r_one", 2_000)).toEqual(expect.objectContaining({ uses: 1 }));
    expect(await store.consume("r_one", 2_000)).toBeUndefined();

    await store.releaseUse("r_one");
    expect(await store.consume("r_one", 2_000)).toEqual(expect.objectContaining({ uses: 1 }));
  });
});
