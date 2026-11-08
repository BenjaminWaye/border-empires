import { describe, expect, it } from "vitest";
import { ACTION_PERIOD_MS, isActionReady, nextActionAvailableAt, tryTakeAction } from "./galaxy-action-gate.js";

describe("tryTakeAction", () => {
  it("allows the first action and records it", () => {
    expect(tryTakeAction({ lastGatedActionAt: null }, 1_000)).toEqual({ ok: true, state: { lastGatedActionAt: 1_000 } });
  });
  it("blocks a second within a day and says when it is ready again", () => {
    expect(tryTakeAction({ lastGatedActionAt: 1_000 }, 1_000 + ACTION_PERIOD_MS - 1)).toEqual({
      ok: false,
      code: "ACTION_NOT_READY",
      availableAt: 1_000 + ACTION_PERIOD_MS
    });
  });
  it("is ready again exactly one day later, and never banks a second", () => {
    expect(tryTakeAction({ lastGatedActionAt: 1_000 }, 1_000 + ACTION_PERIOD_MS).ok).toBe(true);
    const later = tryTakeAction({ lastGatedActionAt: 1_000 }, 1_000 + 5 * ACTION_PERIOD_MS);
    expect(later.ok && isActionReady(later.state, 1_000 + 5 * ACTION_PERIOD_MS + 1)).toBe(false);
  });
  it("a new Duke or system is ready immediately", () => {
    expect(nextActionAvailableAt({ lastGatedActionAt: null })).toBe(0);
    expect(isActionReady(undefined, 0)).toBe(true);
  });
});
