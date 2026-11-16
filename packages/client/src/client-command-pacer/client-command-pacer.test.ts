import { describe, expect, it } from "vitest";
import { COMMAND_RATE_LIMIT_CAPACITY, COMMAND_RATE_LIMIT_REFILL_PER_SECOND } from "@border-empires/shared";
import { COMMAND_PACER_MAX_RETRIES, COMMAND_PACER_STALE_MS, createCommandPacer } from "./client-command-pacer.js";

// Replica of the gateway's per-player token bucket (apps/realtime-gateway/src/command-rate-limiter).
const gatewayBucket = () => {
  let tokens = COMMAND_RATE_LIMIT_CAPACITY;
  let last = 0;
  return (at: number): boolean => {
    tokens = Math.min(COMMAND_RATE_LIMIT_CAPACITY, tokens + ((at - last) / 1000) * COMMAND_RATE_LIMIT_REFILL_PER_SECOND);
    last = at;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
};

const harness = () => {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const delivered: unknown[] = [];
  let ready = true;
  const pacer = createCommandPacer({
    now: () => now,
    schedule: (fn, delayMs) => { timers.push({ at: now + delayMs, fn }); },
    deliver: (payload) => { delivered.push(payload); },
    isReady: () => ready
  });
  const runUntil = (until: number, onTick?: () => void): void => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > until) break;
      timers.shift();
      now = next.at;
      next.fn();
      onTick?.();
    }
    now = until;
  };
  return { pacer, delivered, runUntil, timeNow: () => now, setReady: (value: boolean) => { ready = value; } };
};

// Garrison Many on 33 tiles, as actually sent: one DEV_QUEUE_ENQUEUE (no
// commandId -- devQueueEnqueueWirePayload) for each of the first 20, then the
// first SETTLE, all in one tick -- the burst that popped "Error
// COMMAND_RATE_LIMITED: command rate limit" -- then the next SETTLEs.
const garrisonManyBurst = (): { type: string; x: number; y: number }[] => [
  ...Array.from({ length: 20 }, (_, i) => ({ type: "DEV_QUEUE_ENQUEUE", kind: "SETTLE", x: i, y: 0 })),
  ...Array.from({ length: 13 }, (_, i) => ({ type: "SETTLE", x: i, y: 0 }))
];
const ids = (payloads: unknown[]): string[] => (payloads as { type: string; x: number }[]).map((p) => `${p.type}:${p.x}`);

describe("client command pacer", () => {
  it("never lets a Garrison Many burst exceed the gateway's command bucket", () => {
    const { pacer, delivered, runUntil, timeNow } = harness();
    const gateway = gatewayBucket();
    let rejected = 0;
    let seen = 0;
    const check = (): void => {
      while (seen < delivered.length) { seen += 1; if (!gateway(timeNow())) rejected += 1; }
    };
    for (const payload of garrisonManyBurst()) expect(pacer.send(payload)).toBe(true);
    check();
    runUntil(30_000, check);
    expect(delivered).toHaveLength(33);
    expect(rejected).toBe(0);
    expect(ids(delivered)).toEqual(ids(garrisonManyBurst()));
  });

  it("does not delay unlimited messages (attacks, tile detail) behind a backlog", () => {
    const { pacer, delivered } = harness();
    for (const payload of garrisonManyBurst()) pacer.send(payload);
    const before = delivered.length;
    pacer.send({ type: "ATTACK", fromX: 0, fromY: 0, toX: 1, toY: 0 });
    pacer.send({ type: "REQUEST_TILE_DETAIL", x: 0, y: 0 });
    expect(delivered.length).toBe(before + 2);
  });

  it("re-sends rejected commands (with or without a commandId) in rejection order, before newer ones", () => {
    const { pacer, delivered, runUntil } = harness();
    const a = { type: "DEV_QUEUE_ENQUEUE", kind: "SETTLE", x: 1, y: 0 };
    const b = { type: "DEV_QUEUE_ENQUEUE", kind: "SETTLE", x: 2, y: 0 };
    pacer.send(a);
    pacer.send(b);
    expect(pacer.noteServerThrottle(500, JSON.parse(JSON.stringify(a)))).toBe(true);
    expect(pacer.noteServerThrottle(500, JSON.parse(JSON.stringify(b)))).toBe(true);
    pacer.send({ type: "SETTLE", x: 3, y: 0 });
    runUntil(499);
    expect(delivered).toHaveLength(2);
    runUntil(5_000);
    expect(ids(delivered)).toEqual(["DEV_QUEUE_ENQUEUE:1", "DEV_QUEUE_ENQUEUE:2", "DEV_QUEUE_ENQUEUE:1", "DEV_QUEUE_ENQUEUE:2", "SETTLE:3"]);
  });

  it("gives up on a command the gateway keeps rejecting", () => {
    const { pacer } = harness();
    const a = { type: "CHOOSE_TECH", techId: "t" };
    for (let i = 0; i < COMMAND_PACER_MAX_RETRIES; i += 1) expect(pacer.noteServerThrottle(100, a)).toBe(true);
    expect(pacer.noteServerThrottle(100, a)).toBe(false);
    expect(pacer.noteServerThrottle(100, undefined)).toBe(false);
    expect(pacer.noteServerThrottle(100, { type: "ATTACK" })).toBe(false);
  });

  it("holds the backlog through a brief auth refresh, then drops it once stale", () => {
    const { pacer, delivered, runUntil, setReady } = harness();
    for (const payload of garrisonManyBurst()) pacer.send(payload);
    const sentFirst = delivered.length;
    setReady(false);
    runUntil(2_000);
    expect(delivered).toHaveLength(sentFirst);
    setReady(true);
    runUntil(30_000);
    expect(delivered).toHaveLength(33);

    const second = harness();
    for (const payload of garrisonManyBurst()) second.pacer.send(payload);
    const sent = second.delivered.length;
    second.setReady(false);
    second.runUntil(COMMAND_PACER_STALE_MS + 1_000);
    second.setReady(true);
    second.runUntil(COMMAND_PACER_STALE_MS + 30_000);
    expect(second.delivered).toHaveLength(sent);
    expect(second.pacer.pendingCount()).toBe(0);
  });

  it("bounds the backlog", () => {
    const pacer = createCommandPacer({ now: () => 0, schedule: () => undefined, deliver: () => undefined, isReady: () => true, maxPending: 2 });
    for (let i = 0; i < 16; i += 1) pacer.send({ type: "SETTLE", x: i, y: 0 });
    expect(pacer.send({ type: "SETTLE", x: 100, y: 0 })).toBe(true);
    expect(pacer.send({ type: "SETTLE", x: 101, y: 0 })).toBe(true);
    expect(pacer.send({ type: "SETTLE", x: 102, y: 0 })).toBe(false);
    expect(pacer.pendingCount()).toBe(2);
  });
});
