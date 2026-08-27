import { describe, expect, it } from "vitest";

import { settleProgressSetChanged } from "./client-settle-progress-diff.js";
import type { TileTimedProgress } from "../client-types.js";

const progress = (overrides: Partial<TileTimedProgress> = {}): TileTimedProgress => ({
  startAt: 1000,
  resolvesAt: 2000,
  target: { x: 5, y: 5 },
  awaitingServerConfirm: false,
  ...overrides
});

describe("settleProgressSetChanged", () => {
  it("is false for two empty maps", () => {
    expect(settleProgressSetChanged(new Map(), new Map())).toBe(false);
  });

  it("is true when a key is added", () => {
    expect(settleProgressSetChanged(new Map(), new Map([["5,5", progress()]]))).toBe(true);
  });

  it("is true when a key is removed", () => {
    expect(settleProgressSetChanged(new Map([["5,5", progress()]]), new Map())).toBe(true);
  });

  it("is false when the same entry is unchanged", () => {
    const previous = new Map([["5,5", progress()]]);
    const next = new Map([["5,5", progress()]]);
    expect(settleProgressSetChanged(previous, next)).toBe(false);
  });

  it("is true when resolvesAt changes for an existing key", () => {
    const previous = new Map([["5,5", progress({ resolvesAt: 2000 })]]);
    const next = new Map([["5,5", progress({ resolvesAt: 3000 })]]);
    expect(settleProgressSetChanged(previous, next)).toBe(true);
  });

  it("is true when startAt changes for an existing key", () => {
    const previous = new Map([["5,5", progress({ startAt: 1000 })]]);
    const next = new Map([["5,5", progress({ startAt: 1500 })]]);
    expect(settleProgressSetChanged(previous, next)).toBe(true);
  });

  it("ignores unrelated field changes (e.g. awaitingServerConfirm/confirmRefreshRequestedAt heartbeat updates)", () => {
    const previous = new Map([["5,5", progress({ awaitingServerConfirm: false })]]);
    const next = new Map([["5,5", progress({ awaitingServerConfirm: true, confirmRefreshRequestedAt: 9999 })]]);
    expect(settleProgressSetChanged(previous, next)).toBe(false);
  });
});
