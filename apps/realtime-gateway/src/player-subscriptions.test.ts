import { describe, expect, it, vi } from "vitest";

import { createPlayerSubscriptions } from "./player-subscriptions.js";

describe("createPlayerSubscriptions", () => {
  it("reuses the cached snapshot for later sockets and unsubscribes on last socket", async () => {
    const subscribePlayer = vi.fn(async (playerId: string) => ({ playerId, tiles: [{ x: 10, y: 10 }] }));
    const unsubscribePlayer = vi.fn(async () => {});
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer,
      unsubscribePlayer
    });

    const firstSocket = { readyState: 1 };
    const secondSocket = { readyState: 1 };

    await expect(subscriptions.addSocket("player-1", firstSocket)).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
    const secondResult = await subscriptions.addSocket("player-1", secondSocket);
    expect(subscribePlayer).toHaveBeenCalledTimes(1);
    expect(secondResult).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });

    await subscriptions.removeSocket("player-1", firstSocket);
    expect(unsubscribePlayer).not.toHaveBeenCalled();

    await subscriptions.removeSocket("player-1", secondSocket);
    expect(unsubscribePlayer).toHaveBeenCalledTimes(1);
  });

  it("dedupes an in-flight subscribe across concurrent sockets for the same player", async () => {
    let resolveSubscribe: ((value: { playerId: string; tiles: Array<{ x: number; y: number }> }) => void) | undefined;
    const subscribePlayer = vi.fn(
      () =>
        new Promise<{ playerId: string; tiles: Array<{ x: number; y: number }> }>((resolve) => {
          resolveSubscribe = resolve;
        })
    );
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer,
      unsubscribePlayer: async () => undefined
    });

    const firstPromise = subscriptions.addSocket("player-1", { readyState: 1 });
    const secondPromise = subscriptions.addSocket("player-1", { readyState: 1 });

    expect(subscribePlayer).toHaveBeenCalledTimes(1);
    resolveSubscribe?.({ playerId: "player-1", tiles: [{ x: 10, y: 10 }] });

    await expect(firstPromise).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
    await expect(secondPromise).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
  });

  it("returns sockets across all subscribed players", async () => {
    const subscriptions = createPlayerSubscriptions<{ readyState: number; id: string }, { playerId: string; tiles: [] }>({
      subscribePlayer: async (playerId) => ({ playerId, tiles: [] }),
      unsubscribePlayer: async () => undefined
    });

    const firstSocket = { readyState: 1, id: "a" };
    const secondSocket = { readyState: 1, id: "b" };

    await subscriptions.addSocket("player-1", firstSocket);
    await subscriptions.addSocket("player-2", secondSocket);

    expect([...subscriptions.allSockets()]).toEqual([firstSocket, secondSocket]);
  });

  it("updates a cached snapshot in place for later reads", async () => {
    const subscriptions = createPlayerSubscriptions<
      { readyState: number },
      { playerId: string; tiles: Array<{ x: number; y: number; ownerId?: string }> }
    >({
      subscribePlayer: async (playerId) => ({ playerId, tiles: [{ x: 10, y: 10, ownerId: playerId }] }),
      unsubscribePlayer: async () => undefined
    });

    await subscriptions.addSocket("player-1", { readyState: 1 });
    subscriptions.updateSnapshot("player-1", (snapshot) => ({
      ...snapshot,
      tiles: [...snapshot.tiles, { x: 11, y: 10, ownerId: "player-1" }]
    }));

    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [
        { x: 10, y: 10, ownerId: "player-1" },
        { x: 11, y: 10, ownerId: "player-1" }
      ]
    });
  });

  it("refreshes a cached snapshot from the subscribe source", async () => {
    let callCount = 0;
    const subscriptions = createPlayerSubscriptions<
      { readyState: number },
      { playerId: string; tiles: Array<{ x: number; y: number; ownerId?: string }> }
    >({
      subscribePlayer: async (playerId) => {
        callCount += 1;
        return { playerId, tiles: [{ x: 10, y: 10 + callCount, ownerId: playerId }] };
      },
      unsubscribePlayer: async () => undefined
    });

    await subscriptions.addSocket("player-1", { readyState: 1 });
    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 11, ownerId: "player-1" }]
    });

    await expect(subscriptions.refreshSnapshot("player-1")).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 12, ownerId: "player-1" }]
    });
    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 12, ownerId: "player-1" }]
    });
  });
});
