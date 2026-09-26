import { describe, expect, it } from "vitest";
import { ACTION_CYCLE_MS, nextActionAvailableAt, tryTakeAction } from "./galaxy-action-gate.js";

describe("tryTakeAction", () => {
  it("allows the first Petition and records it", () => {
    expect(tryTakeAction({ lastGatedActionAt: null }, 1_000)).toEqual({ ok: true, state: { lastGatedActionAt: 1_000 } });
  });
  it("blocks a second inside the same Cycle and says when it frees up", () => {
    expect(tryTakeAction({ lastGatedActionAt: 1_000 }, 1_000 + ACTION_CYCLE_MS - 1)).toEqual({
      ok: false,
      code: "ACTION_ALREADY_TAKEN_THIS_CYCLE",
      availableAt: 1_000 + ACTION_CYCLE_MS
    });
  });
  it("frees up exactly one Cycle later", () => {
    expect(tryTakeAction({ lastGatedActionAt: 1_000 }, 1_000 + ACTION_CYCLE_MS).ok).toBe(true);
  });
  it("a new Duke is available immediately", () => {
    expect(nextActionAvailableAt({ lastGatedActionAt: null })).toBe(0);
  });
});
