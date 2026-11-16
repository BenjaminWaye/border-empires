import { describe, expect, it } from "vitest";
import { COMMAND_RATE_LIMIT_CAPACITY, COMMAND_RATE_LIMIT_REFILL_PER_SECOND } from "@border-empires/shared";
import { createCommandPacer } from "./client-command-pacer.js";

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
  let connected = true;
  const pacer = createCommandPacer({
    now: () => now,
    schedule: (fn, delayMs) => { timers.push({ at: now + delayMs, fn }); },
    deliver: (payload) => { if (!connected) return false; delivered.push(payload); return true; }
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
  return { pacer, delivered, runUntil, timeNow: () => now, disconnect: () => { connected = false; } };
};

// Garrison Many on 33 tiles: one DEV_QUEUE_ENQUEUE for each of the first 20
// (the server tier) plus the first SETTLE, all in one tick -- the burst that
// popped "Error COMMAND_RATE_LIMITED: command rate limit".
const garrisonManyBurst = (): unknown[] => [
  ...Array.from({ length: 20 }, (_, i) => ({ type: "DEV_QUEUE_ENQUEUE", kind: "SETTLE", x: i, y: 0, commandId: `q${i}` })),
  { type: "SETTLE", x: 0, y: 0, commandId: "s0" },
  // ...followed by the next SETTLEs as the queue drains.
  ...Array.from({ length: 12 }, (_, i) => ({ type: "SETTLE", x: i + 1, y: 0, commandId: `s${i + 1}` }))
];

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
    // Order is preserved: every enqueue goes out before the SETTLEs.
    expect((delivered as { commandId: string }[]).map((p) => p.commandId)).toEqual((garrisonManyBurst() as { commandId: string }[]).map((p) => p.commandId));
  });

  it("does not delay unlimited messages (attacks, tile detail) behind a backlog", () => {
    const { pacer, delivered } = harness();
    for (const payload of garrisonManyBurst()) pacer.send(payload);
    const before = delivered.length;
    pacer.send({ type: "ATTACK", fromX: 0, fromY: 0, toX: 1, toY: 0 });
    pacer.send({ type: "REQUEST_TILE_DETAIL", x: 0, y: 0 });
    expect(delivered.length).toBe(before + 2);
  });

  it("re-sends the exact command the gateway rejected, after its retry window", () => {
    const { pacer, delivered, runUntil } = harness();
    pacer.send({ type: "SETTLE", x: 1, y: 1, commandId: "c1" });
    expect(delivered).toHaveLength(1);
    expect(pacer.noteServerThrottle(500, "c1")).toBe(true);
    pacer.send({ type: "SETTLE", x: 2, y: 2, commandId: "c2" });
    runUntil(499);
    expect(delivered).toHaveLength(1);
    runUntil(5_000);
    expect((delivered as { commandId: string }[]).map((p) => p.commandId)).toEqual(["c1", "c1", "c2"]);
  });

  it("drops the backlog rather than firing it into a dead connection", () => {
    const { pacer, delivered, runUntil, disconnect } = harness();
    for (const payload of garrisonManyBurst()) pacer.send(payload);
    const sentBeforeDisconnect = delivered.length;
    disconnect();
    runUntil(30_000);
    expect(delivered).toHaveLength(sentBeforeDisconnect);
    expect(pacer.pendingCount()).toBe(0);
  });

  it("bounds the backlog", () => {
    let now = 0;
    const pacer = createCommandPacer({ now: () => now, schedule: () => undefined, deliver: () => true, maxPending: 2 });
    for (let i = 0; i < 18; i += 1) pacer.send({ type: "SETTLE", x: i, y: 0 });
    expect(pacer.send({ type: "SETTLE", x: 100, y: 0 })).toBe(true);
    expect(pacer.send({ type: "SETTLE", x: 101, y: 0 })).toBe(true);
    expect(pacer.send({ type: "SETTLE", x: 102, y: 0 })).toBe(false);
    now += 1;
  });
});
