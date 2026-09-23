import { describe, expect, it } from "vitest";
import { ACTION_CYCLE_MS, nextActionAvailableAt, tryTakeAction } from "./galaxy-action-gate.js";

describe("tryTakeAction", () => {
  it("allows the first gated action and records it", () => {
    const result = tryTakeAction({ lastGatedActionAt: null }, "INVEST", 1_000);
    expect(result).toEqual({ ok: true, state: { lastGatedActionAt: 1_000 } });
  });
  it("blocks a second gated action inside the same Cycle and says when it frees up", () => {
    const result = tryTakeAction({ lastGatedActionAt: 1_000 }, "GIVE_ORDER", 1_000 + ACTION_CYCLE_MS - 1);
    expect(result).toEqual({ ok: false, code: "ACTION_ALREADY_TAKEN_THIS_CYCLE", availableAt: 1_000 + ACTION_CYCLE_MS });
  });
  it("frees up exactly one Cycle later", () => {
    expect(tryTakeAction({ lastGatedActionAt: 1_000 }, "PETITION_SENATE", 1_000 + ACTION_CYCLE_MS).ok).toBe(true);
  });
  it("never gates Defend posture, Probes or answering a Writ, and doesn't consume the slot", () => {
    const state = { lastGatedActionAt: 1_000 };
    for (const kind of ["DEFEND_POSTURE", "PROBE", "ANSWER_WRIT"] as const) {
      expect(tryTakeAction(state, kind, 2_000)).toEqual({ ok: true, state });
    }
  });
  it("a new Duke is available immediately", () => {
    expect(nextActionAvailableAt({ lastGatedActionAt: null })).toBe(0);
  });
});
