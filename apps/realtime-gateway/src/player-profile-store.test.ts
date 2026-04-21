import { describe, expect, it, vi } from "vitest";

import { InMemoryGatewayPlayerProfileStore } from "./player-profile-store.js";

describe("InMemoryGatewayPlayerProfileStore", () => {
  it("persists profile values by player id", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = new InMemoryGatewayPlayerProfileStore();
    await expect(store.get("player-1")).resolves.toBeUndefined();

    await expect(store.setProfile("player-1", "Nauticus", "#123456")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#123456",
      profileComplete: true,
      updatedAt: 1_000
    });
    await expect(store.get("player-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#123456",
      profileComplete: true,
      updatedAt: 1_000
    });
    vi.useRealTimers();
  });

  it("updates color without dropping existing display name", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setProfile("player-1", "Nauticus", "#123456");
    vi.setSystemTime(3_000);

    await expect(store.setTileColor("player-1", "#abcdef")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#abcdef",
      profileComplete: true,
      updatedAt: 3_000
    });
    vi.useRealTimers();
  });
});
