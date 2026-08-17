import { describe, expect, it } from "vitest";

import { createLoginQueue } from "./login-queue.js";

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

describe("createLoginQueue", () => {
  it("resolves true and removes the entry once drained", async () => {
    let inFlight = 1;
    const sent: unknown[] = [];
    const queue = createLoginQueue({
      maxConcurrentBootstraps: 1,
      bootstrapEstimateMs: 1000,
      bootstrapsInFlight: () => inFlight,
      sendJson: (_socket, payload) => sent.push(payload)
    });

    const socket = createSocket();
    const waitPromise = queue.enqueueAndWait(socket as unknown as import("ws").WebSocket);
    expect(queue.size()).toBe(1);

    inFlight = 0; // slot freed
    queue.drain();

    const granted = await waitPromise;
    expect(granted).toBe(true);
    expect(queue.size()).toBe(0);
  });

  it("does not drain while over concurrency", () => {
    const inFlight = () => 1;
    const queue = createLoginQueue({
      maxConcurrentBootstraps: 1,
      bootstrapEstimateMs: 1000,
      bootstrapsInFlight: inFlight,
      sendJson: () => {}
    });
    const socket = createSocket();
    void queue.enqueueAndWait(socket as unknown as import("ws").WebSocket);
    queue.drain();
    expect(queue.size()).toBe(1);
  });

  it("resolves false and removes the entry when the socket closes while queued", async () => {
    const queue = createLoginQueue({
      maxConcurrentBootstraps: 1,
      bootstrapEstimateMs: 1000,
      bootstrapsInFlight: () => 1,
      sendJson: () => {}
    });
    const socket = createSocket();
    const waitPromise = queue.enqueueAndWait(socket as unknown as import("ws").WebSocket);
    expect(queue.size()).toBe(1);

    socket.emit("close");

    const granted = await waitPromise;
    expect(granted).toBe(false);
    expect(queue.size()).toBe(0);
  });

  it("computes estimated wait time proportionally to position and concurrency", () => {
    const queue = createLoginQueue({
      maxConcurrentBootstraps: 2,
      bootstrapEstimateMs: 1000,
      bootstrapsInFlight: () => 0,
      sendJson: () => {}
    });
    expect(queue.estimatedWaitMs(2)).toBe(1000);
    expect(queue.estimatedWaitMs(1)).toBe(500);
  });
});
