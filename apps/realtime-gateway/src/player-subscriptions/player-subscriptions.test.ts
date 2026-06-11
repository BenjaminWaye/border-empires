import { describe, expect, it, vi } from "vitest";

import { createPlayerSubscriptions } from "./player-subscriptions.js";

describe("createPlayerSubscriptions", () => {
  it("reuses the cached snapshot for later sockets and unsubscribes on last socket", async () => {
    const subscribePlayer = vi.fn(async (playerId: string) => ({ playerId, tiles: [{ x: 10, y: 10 }] }));
    const unsubscribePlayer = vi.fn(async () => {});
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer,
      unsubscribePlayer,
      subscriptionNamespace: "gateway-a"
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
    expect(unsubscribePlayer).toHaveBeenCalledWith("player-1", "gateway-a:player-1:1");
    expect([...subscriptions.socketsForPlayer("player-1")]).toEqual([]);
  });

  it("deduplicates concurrent subscribe requests for the same player", async () => {
    let resolveSubscribe: ((value: { playerId: string; tiles: Array<{ x: number; y: number }> }) => void) | undefined;
    const subscribePlayer = vi.fn(
      () =>
        new Promise<{ playerId: string; tiles: Array<{ x: number; y: number }> }>((resolve) => {
          resolveSubscribe = resolve;
        })
    );
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer,
      unsubscribePlayer: async () => undefined,
      subscriptionNamespace: "gateway-a"
    });

    const firstPromise = subscriptions.addSocket("player-1", { readyState: 1 });
    const secondPromise = subscriptions.addSocket("player-1", { readyState: 1 });

    expect(subscribePlayer).toHaveBeenCalledTimes(1);
    expect(subscribePlayer).toHaveBeenCalledWith("player-1", "gateway-a:player-1:1");
    resolveSubscribe?.({ playerId: "player-1", tiles: [{ x: 10, y: 10 }] });

    await expect(firstPromise).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
    await expect(secondPromise).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });
  });

  it("cleans up a subscribe that resolves after the last socket disconnects", async () => {
    let resolveSubscribe: ((value: { playerId: string; tiles: Array<{ x: number; y: number }> }) => void) | undefined;
    const unsubscribePlayer = vi.fn(async () => undefined);
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer: () =>
        new Promise<{ playerId: string; tiles: Array<{ x: number; y: number }> }>((resolve) => {
          resolveSubscribe = resolve;
        }),
      unsubscribePlayer,
      subscriptionNamespace: "gateway-a"
    });

    const socket = { readyState: 1 };
    const subscribePromise = subscriptions.addSocket("player-1", socket);

    await subscriptions.removeSocket("player-1", socket);
    expect(unsubscribePlayer).toHaveBeenCalledTimes(1);

    resolveSubscribe?.({ playerId: "player-1", tiles: [{ x: 10, y: 10 }] });
    await expect(subscribePromise).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });

    expect(unsubscribePlayer).toHaveBeenCalledTimes(2);
    expect(unsubscribePlayer.mock.calls).toEqual([
      ["player-1", "gateway-a:player-1:1"],
      ["player-1", "gateway-a:player-1:1"]
    ]);
    expect(subscriptions.snapshotForPlayer("player-1")).toBeUndefined();
    expect([...subscriptions.socketsForPlayer("player-1")]).toEqual([]);
  });

  it("ignores a stale subscribe result after disconnect and reconnect", async () => {
    const subscribeResolvers: Array<(value: { playerId: string; tiles: Array<{ x: number; y: number }> }) => void> = [];
    const unsubscribePlayer = vi.fn(async () => undefined);
    const subscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: Array<{ x: number; y: number }> }>({
      subscribePlayer: () =>
        new Promise<{ playerId: string; tiles: Array<{ x: number; y: number }> }>((resolve) => {
          subscribeResolvers.push(resolve);
        }),
      unsubscribePlayer,
      subscriptionNamespace: "gateway-a"
    });

    const firstSocket = { readyState: 1 };
    const secondSocket = { readyState: 1 };

    const firstSubscribe = subscriptions.addSocket("player-1", firstSocket);
    await subscriptions.removeSocket("player-1", firstSocket);

    const secondSubscribe = subscriptions.addSocket("player-1", secondSocket);

    subscribeResolvers[0]?.({ playerId: "player-1", tiles: [{ x: 10, y: 10 }] });
    await expect(firstSubscribe).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10 }]
    });

    expect(subscriptions.snapshotForPlayer("player-1")).toBeUndefined();
    expect(unsubscribePlayer).toHaveBeenCalledTimes(2);
    expect(unsubscribePlayer.mock.calls).toEqual([
      ["player-1", "gateway-a:player-1:1"],
      ["player-1", "gateway-a:player-1:1"]
    ]);

    subscribeResolvers[1]?.({ playerId: "player-1", tiles: [{ x: 20, y: 20 }] });
    await expect(secondSubscribe).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 20, y: 20 }]
    });

    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [{ x: 20, y: 20 }]
    });
    expect(unsubscribePlayer).toHaveBeenCalledTimes(2);
    expect(subscribeResolvers).toHaveLength(2);
  });

  it("uses a different subscription namespace after a gateway restart", async () => {
    const firstCalls: string[] = [];
    const secondCalls: string[] = [];
    const firstSubscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: [] }>({
      subscribePlayer: async (playerId, subscriptionKey) => {
        if (subscriptionKey) firstCalls.push(subscriptionKey);
        return { playerId, tiles: [] };
      },
      unsubscribePlayer: async (_playerId, subscriptionKey) => {
        if (subscriptionKey) firstCalls.push(`unsubscribe:${subscriptionKey}`);
      },
      subscriptionNamespace: "gateway-a"
    });
    const secondSubscriptions = createPlayerSubscriptions<{ readyState: number }, { playerId: string; tiles: [] }>({
      subscribePlayer: async (playerId, subscriptionKey) => {
        if (subscriptionKey) secondCalls.push(subscriptionKey);
        return { playerId, tiles: [] };
      },
      unsubscribePlayer: async (_playerId, subscriptionKey) => {
        if (subscriptionKey) secondCalls.push(`unsubscribe:${subscriptionKey}`);
      },
      subscriptionNamespace: "gateway-b"
    });

    const firstSocket = { readyState: 1 };
    const secondSocket = { readyState: 1 };

    await firstSubscriptions.addSocket("player-1", firstSocket);
    await firstSubscriptions.removeSocket("player-1", firstSocket);
    await secondSubscriptions.addSocket("player-1", secondSocket);

    expect(firstCalls).toEqual([
      "gateway-a:player-1:1",
      "unsubscribe:gateway-a:player-1:1"
    ]);
    expect(secondCalls).toEqual(["gateway-b:player-1:1"]);
  });

  it("returns sockets across all subscribed players", async () => {
    const subscriptions = createPlayerSubscriptions<{ readyState: number; id: string }, { playerId: string; tiles: [] }>({
      subscribePlayer: async (playerId) => ({ playerId, tiles: [] }),
      unsubscribePlayer: async () => undefined,
      subscriptionNamespace: "gateway-a"
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
      unsubscribePlayer: async () => undefined,
      subscriptionNamespace: "gateway-a"
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
      unsubscribePlayer: async () => undefined,
      subscriptionNamespace: "gateway-a"
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

  it("can seed a bootstrap snapshot before the live subscribe completes", async () => {
    let callCount = 0;
    const subscriptions = createPlayerSubscriptions<
      { readyState: number },
      { playerId: string; tiles: Array<{ x: number; y: number; ownerId?: string }> }
    >({
      subscribePlayer: async (playerId) => {
        callCount += 1;
        return { playerId, tiles: [{ x: 10, y: 10 + callCount, ownerId: playerId }] };
      },
      unsubscribePlayer: async () => undefined,
      subscriptionNamespace: "gateway-a"
    });

    const socket = { readyState: 1 };
    subscriptions.attachSocket("player-1", socket);
    subscriptions.seedSnapshot("player-1", { playerId: "player-1", tiles: [{ x: 10, y: 10, ownerId: "player-1" }] });

    expect(subscriptions.snapshotForPlayer("player-1")).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10, ownerId: "player-1" }]
    });

    await expect(subscriptions.ensureSubscribed("player-1")).resolves.toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 11, ownerId: "player-1" }]
    });
    expect(callCount).toBe(1);
    expect([...subscriptions.socketsForPlayer("player-1")]).toEqual([socket]);
  });
});
