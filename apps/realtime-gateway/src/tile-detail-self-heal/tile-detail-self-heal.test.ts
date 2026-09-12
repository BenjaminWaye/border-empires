import { describe, expect, it } from "vitest";

import { isSelfHealRejectionCode, selfHealTargetFromRejection } from "./tile-detail-self-heal.js";

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

describe("muster rejection self-heal", () => {
  it("treats MUSTER_INVALID as a self-heal code and reads the flag tile from x/y", () => {
    // Regression: CLEAR_MUSTER is only offered by the client when it still
    // believes a muster flag is on the tile, so "no muster on owned tile"
    // means the client's belief is stale. Its payload addresses the tile as
    // x/y (not the ATTACK/EXPAND toX/toY), so the parser has to accept both
    // shapes or the heal never fires.
    expect(isSelfHealRejectionCode("MUSTER_INVALID")).toBe(true);
    expect(selfHealTargetFromRejection("MUSTER_INVALID", JSON.stringify({ x: 90, y: 317 }))).toEqual({ x: 90, y: 317 });
  });

  it("still prefers toX/toY when a payload carries both shapes", () => {
    const payloadJson = JSON.stringify({ x: 1, y: 2, toX: 8, toY: 9 });
    expect(selfHealTargetFromRejection("ATTACK_TARGET_INVALID", payloadJson)).toEqual({ x: 8, y: 9 });
  });

  it("returns undefined for a muster rejection with no coordinates", () => {
    expect(selfHealTargetFromRejection("MUSTER_INVALID", JSON.stringify({ mode: "HOLD" }))).toBeUndefined();
  });
});

describe("collect shard rejection self-heal", () => {
  it("treats COLLECT_EMPTY as a self-heal code and reads the tile from x/y", () => {
    // Regression: the tile menu only offers Collect Shard when the client
    // still believes a shard is present, so "no shard present" means the
    // client (or the gateway's cached snapshot) is holding a phantom the sim
    // already cleared. COLLECT_SHARD's payload addresses the tile as plain
    // x/y, same shape as MUSTER_INVALID.
    expect(isSelfHealRejectionCode("COLLECT_EMPTY")).toBe(true);
    expect(selfHealTargetFromRejection("COLLECT_EMPTY", JSON.stringify({ x: 74, y: 414 }))).toEqual({ x: 74, y: 414 });
  });
});
