import { describe, expect, it, vi } from "vitest";

import { createLoginQueue } from "./login-queue.js";
import { admitBootstrap, type BootstrapAdmissionDeps } from "./bootstrap-admission.js";

type FakeSocket = {
  readyState: number;
  readonly OPEN: number;
  listeners: Map<string, Array<() => void>>;
  once: (event: string, handler: () => void) => void;
  emit: (event: string) => void;
};

const createSocket = (): FakeSocket => {
  const listeners = new Map<string, Array<() => void>>();
  return {
    readyState: 1,
    OPEN: 1,
    listeners,
    once: (event, handler) => {
      const arr = listeners.get(event) ?? [];
      arr.push(handler);
      listeners.set(event, arr);
    },
    emit: (event) => {
      for (const handler of listeners.get(event) ?? []) handler();
    }
  };
};

const createDeps = (overrides: Partial<BootstrapAdmissionDeps> = {}): {
  deps: BootstrapAdmissionDeps;
  getInFlight: () => number;
  sent: unknown[];
} => {
  let inFlight = 0;
  const sent: unknown[] = [];
  const loginQueue = createLoginQueue({
    maxConcurrentBootstraps: overrides.maxConcurrentBootstraps ?? 1,
    bootstrapEstimateMs: 1000,
    bootstrapsInFlight: () => inFlight,
    sendJson: (_socket, payload) => sent.push(payload)
  });
  const deps: BootstrapAdmissionDeps = {
    bootstrapsInFlight: () => inFlight,
    incrementBootstrapsInFlight: () => { inFlight += 1; },
    decrementBootstrapsInFlight: () => { inFlight -= 1; },
    maxConcurrentBootstraps: 1,
    minBootstrapIntervalMs: 0,
    lastBootstrapAtByPlayerId: new Map(),
    maxLoginQueueSize: 50,
    loginQueue,
    gatewayMetrics: {
      incrementLoginQueuedTotal: vi.fn(),
      incrementLoginQueueRejectedTotal: vi.fn()
    },
    recordGatewayEvent: vi.fn(),
    sendJson: (_socket, payload) => sent.push(payload),
    ...overrides
  };
  return { deps, getInFlight: () => inFlight, sent };
};

describe("admitBootstrap", () => {
  it("grants immediately when under capacity and releases the slot on success", async () => {
    const { deps, getInFlight } = createDeps();
    const socket = createSocket();

    const result = await admitBootstrap("player-1", "control", socket as unknown as import("ws").WebSocket, deps);

    expect(result.granted).toBe(true);
    expect(getInFlight()).toBe(1);
    if (result.granted) result.release();
    expect(getInFlight()).toBe(0);
  });

  it("releases exactly once even if release() is called multiple times", async () => {
    const { deps, getInFlight } = createDeps();
    const socket = createSocket();

    const result = await admitBootstrap("player-1", "control", socket as unknown as import("ws").WebSocket, deps);
    expect(result.granted).toBe(true);
    if (result.granted) {
      result.release();
      result.release();
      result.release();
    }
    expect(getInFlight()).toBe(0);
  });

  it("rejects with SERVER_BUSY and does not take a slot when the per-player rate limit is hit", async () => {
    const { deps, getInFlight, sent } = createDeps({ minBootstrapIntervalMs: 60_000 });
    deps.lastBootstrapAtByPlayerId.set("player-1", Date.now());
    const socket = createSocket();

    const result = await admitBootstrap("player-1", "control", socket as unknown as import("ws").WebSocket, deps);

    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("rate");
    expect(getInFlight()).toBe(0);
    expect(sent).toEqual([expect.objectContaining({ type: "ERROR", code: "SERVER_BUSY" })]);
  });

  it("rejects with SERVER_BUSY once the login queue is full and takes no slot", async () => {
    const { deps, getInFlight, sent } = createDeps({ maxConcurrentBootstraps: 1, maxLoginQueueSize: 0 });
    // Take the single slot first so the next caller is over-concurrency.
    const holder = createSocket();
    const first = await admitBootstrap("player-holder", "control", holder as unknown as import("ws").WebSocket, deps);
    expect(first.granted).toBe(true);

    const socket = createSocket();
    const result = await admitBootstrap("player-2", "control", socket as unknown as import("ws").WebSocket, deps);

    expect(result.granted).toBe(false);
    if (!result.granted) expect(result.reason).toBe("queue_full");
    expect(getInFlight()).toBe(1); // only the holder's slot
    expect(sent.some((p) => (p as { code?: string }).code === "SERVER_BUSY")).toBe(true);

    if (first.granted) first.release();
  });

  it("queues over-concurrency callers and grants once a slot frees up", async () => {
    const { deps, getInFlight } = createDeps({ maxConcurrentBootstraps: 1 });
    const holderSocket = createSocket();
    const holder = await admitBootstrap("player-holder", "control", holderSocket as unknown as import("ws").WebSocket, deps);
    expect(holder.granted).toBe(true);

    const waiterSocket = createSocket();
    const waiterPromise = admitBootstrap("player-waiter", "control", waiterSocket as unknown as import("ws").WebSocket, deps);

    // Not yet resolved: holder still occupies the only slot.
    expect(getInFlight()).toBe(1);

    if (holder.granted) holder.release();

    const waiterResult = await waiterPromise;
    expect(waiterResult.granted).toBe(true);
    expect(getInFlight()).toBe(1);
    if (waiterResult.granted) waiterResult.release();
    expect(getInFlight()).toBe(0);
  });

  it("does not leak a slot or grant when the socket closes while queued", async () => {
    const { deps, getInFlight } = createDeps({ maxConcurrentBootstraps: 1 });
    const holderSocket = createSocket();
    const holder = await admitBootstrap("player-holder", "control", holderSocket as unknown as import("ws").WebSocket, deps);
    expect(holder.granted).toBe(true);

    const waiterSocket = createSocket();
    const waiterPromise = admitBootstrap("player-waiter", "control", waiterSocket as unknown as import("ws").WebSocket, deps);

    // Simulate the client disconnecting while queued.
    waiterSocket.emit("close");

    const waiterResult = await waiterPromise;
    expect(waiterResult.granted).toBe(false);
    if (!waiterResult.granted) expect(waiterResult.reason).toBe("queue_socket_closed");
    // Still just the (unreleased) holder's slot -- the waiter never took one.
    expect(getInFlight()).toBe(1);

    if (holder.granted) holder.release();
    expect(getInFlight()).toBe(0);
  });
});

// Regression test pinning the exact hazard described in the gateway-app.ts AUTH
// handler: PreparePlayer (or subscribePlayer) failing after admission is granted
// must still release the bootstrap slot on every exit path, or capacity leaks
// permanently toward zero.
describe("bootstrap admission slot release around simulated prepare/subscribe failures", () => {
  const runAdmittedUnit = async (
    deps: BootstrapAdmissionDeps,
    socket: FakeSocket,
    playerId: string,
    unit: () => Promise<void>
  ): Promise<void> => {
    const admission = await admitBootstrap(playerId, "control", socket as unknown as import("ws").WebSocket, deps);
    if (!admission.granted) return;
    try {
      await unit();
    } finally {
      admission.release();
    }
  };

  it("releases the slot when PreparePlayer throws", async () => {
    const { deps, getInFlight } = createDeps();
    const socket = createSocket();
    const before = getInFlight();

    await expect(
      runAdmittedUnit(deps, socket, "player-1", async () => {
        throw new Error("PreparePlayer RPC failed");
      })
    ).rejects.toThrow("PreparePlayer RPC failed");

    expect(getInFlight()).toBe(before);
  });

  it("releases the slot when subscribePlayer throws after a successful prepare", async () => {
    const { deps, getInFlight } = createDeps();
    const socket = createSocket();
    const before = getInFlight();

    await expect(
      runAdmittedUnit(deps, socket, "player-1", async () => {
        // Simulated PreparePlayer succeeds...
        await Promise.resolve();
        // ...but subscribePlayer fails.
        throw new Error("subscribePlayer RPC failed");
      })
    ).rejects.toThrow("subscribePlayer RPC failed");

    expect(getInFlight()).toBe(before);
  });

  it("releases the slot on the success path too", async () => {
    const { deps, getInFlight } = createDeps();
    const socket = createSocket();
    const before = getInFlight();

    await runAdmittedUnit(deps, socket, "player-1", async () => {
      await Promise.resolve();
    });

    expect(getInFlight()).toBe(before);
  });
});
