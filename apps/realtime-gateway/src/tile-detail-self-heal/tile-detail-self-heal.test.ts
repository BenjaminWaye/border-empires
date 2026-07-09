import { describe, expect, it } from "vitest";

import { selfHealTargetFromRejection } from "./tile-detail-self-heal.js";

describe("selfHealTargetFromRejection", () => {
  it("returns target coords for ATTACK_TARGET_INVALID with a valid payload", () => {
    const payloadJson = JSON.stringify({ fromX: 1, fromY: 2, toX: 5, toY: 9 });
    expect(selfHealTargetFromRejection("ATTACK_TARGET_INVALID", payloadJson)).toEqual({ x: 5, y: 9 });
  });

  it("returns target coords for EXPAND_TARGET_OWNED with a valid payload", () => {
    const payloadJson = JSON.stringify({ fromX: 0, fromY: 0, toX: 3, toY: 4 });
    expect(selfHealTargetFromRejection("EXPAND_TARGET_OWNED", payloadJson)).toEqual({ x: 3, y: 4 });
  });

  it("returns undefined for a non-self-heal code", () => {
    const payloadJson = JSON.stringify({ fromX: 1, fromY: 2, toX: 5, toY: 9 });
    for (const code of ["LOCKED", "NOT_OWNER", "SHIELDED", "ALLY_TARGET", "BARRIER"]) {
      expect(selfHealTargetFromRejection(code, payloadJson)).toBeUndefined();
    }
  });

  it("returns undefined for malformed JSON payload", () => {
    expect(selfHealTargetFromRejection("ATTACK_TARGET_INVALID", "{not-valid-json")).toBeUndefined();
  });

  it("returns undefined when toX/toY are missing", () => {
    const payloadJson = JSON.stringify({ fromX: 1, fromY: 2 });
    expect(selfHealTargetFromRejection("ATTACK_TARGET_INVALID", payloadJson)).toBeUndefined();
  });

  it("returns undefined when toX/toY are non-numeric", () => {
    const payloadJson = JSON.stringify({ fromX: 1, fromY: 2, toX: "5", toY: null });
    expect(selfHealTargetFromRejection("EXPAND_TARGET_OWNED", payloadJson)).toBeUndefined();
  });

  it("returns undefined when payload is not an object", () => {
    expect(selfHealTargetFromRejection("ATTACK_TARGET_INVALID", JSON.stringify(42))).toBeUndefined();
  });
});
