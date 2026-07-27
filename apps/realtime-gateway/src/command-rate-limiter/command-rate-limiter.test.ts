import { describe, expect, it } from "vitest";
import { CommandRateLimiter } from "./command-rate-limiter.js";

describe("CommandRateLimiter", () => {
  it("allows a burst up to capacity, then throttles the next command", () => {
    const limiter = new CommandRateLimiter({ capacity: 3, refillPerSecond: 1 });
    const now = 1_000_000;
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
    const fourth = limiter.tryConsume("p1", now);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills tokens over time at the configured rate", () => {
    const limiter = new CommandRateLimiter({ capacity: 2, refillPerSecond: 2 });
    const t0 = 1_000_000;
    expect(limiter.tryConsume("p1", t0).allowed).toBe(true);
    expect(limiter.tryConsume("p1", t0).allowed).toBe(true);
    expect(limiter.tryConsume("p1", t0).allowed).toBe(false);

    // 500ms later at 2 tokens/sec -> 1 token refilled.
    expect(limiter.tryConsume("p1", t0 + 500).allowed).toBe(true);
    expect(limiter.tryConsume("p1", t0 + 500).allowed).toBe(false);
  });

  it("tracks each player independently", () => {
    const limiter = new CommandRateLimiter({ capacity: 1, refillPerSecond: 1 });
    const now = 1_000_000;
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
    expect(limiter.tryConsume("p1", now).allowed).toBe(false);
    expect(limiter.tryConsume("p2", now).allowed).toBe(true);
  });

  it("releasePlayer evicts the bucket so a reconnecting player starts fresh (bounded map -- see state-and-persistence-discipline.md)", () => {
    const limiter = new CommandRateLimiter({ capacity: 1, refillPerSecond: 1 });
    const now = 1_000_000;
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
    expect(limiter.tryConsume("p1", now).allowed).toBe(false);
    expect(limiter.trackedPlayerCount).toBe(1);

    limiter.releasePlayer("p1");
    expect(limiter.trackedPlayerCount).toBe(0);
    expect(limiter.tryConsume("p1", now).allowed).toBe(true);
  });

  it("never exceeds capacity even after a very long idle period", () => {
    const limiter = new CommandRateLimiter({ capacity: 5, refillPerSecond: 10 });
    const t0 = 1_000_000;
    limiter.tryConsume("p1", t0);
    // Simulate a huge time jump (e.g. reconnect after hours).
    const decision = limiter.tryConsume("p1", t0 + 999_000_000);
    expect(decision.allowed).toBe(true);
    // Bucket should be capped at capacity - 1 after this consume, not overflowed.
    let consumed = 1;
    while (limiter.tryConsume("p1", t0 + 999_000_000).allowed) consumed++;
    expect(consumed).toBe(5);
  });
});
