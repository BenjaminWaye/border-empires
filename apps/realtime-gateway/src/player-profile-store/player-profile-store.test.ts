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

  it("records nameChangedSeasonId only when passed, and keeps it across later unrelated updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const store = new InMemoryGatewayPlayerProfileStore();

    // Initial setup: no season passed, so no season is recorded yet.
    await expect(store.setProfile("player-1", "Nauticus", "#123456")).resolves.toEqual({
      playerId: "player-1",
      name: "Nauticus",
      tileColor: "#123456",
      profileComplete: true,
      updatedAt: 1_000
    });

    // A real rename records the season it happened in.
    await expect(store.setProfile("player-1", "Renamed", "#123456", "season-1")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#123456",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });

    // Color-only updates (no seasonId passed, since the name isn't changing) don't clear it.
    await expect(store.setTileColor("player-1", "#abcdef")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#abcdef",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });
    await expect(store.setProfile("player-1", "Renamed", "#abcdef")).resolves.toEqual({
      playerId: "player-1",
      name: "Renamed",
      tileColor: "#abcdef",
      profileComplete: true,
      nameChangedSeasonId: "season-1",
      updatedAt: 1_000
    });
    vi.useRealTimers();
  });

  it("returns stored profiles for a batch of visible player ids", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(4_000);
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setProfile("player-1", "Nauticus", "#123456");
    await store.setProfile("player-2", "Benjamin Waye", "#654321");

    await expect(store.getMany(["player-2", "missing", "player-1", "player-2"])).resolves.toEqual([
      {
        playerId: "player-2",
        name: "Benjamin Waye",
        tileColor: "#654321",
        profileComplete: true,
        updatedAt: 4_000
      },
      {
        playerId: "player-1",
        name: "Nauticus",
        tileColor: "#123456",
        profileComplete: true,
        updatedAt: 4_000
      }
    ]);
    vi.useRealTimers();
  });
});
