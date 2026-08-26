import { describe, expect, it } from "vitest";

import { jsonSafeTileDeltaBatch } from "./gateway-bootstrap-helpers.js";

describe("jsonSafeTileDeltaBatch", () => {
  it("coerces an undefined townJson to an empty string so the clear survives JSON.stringify", () => {
    // Captured-settlement town clears are sparse deltas where townJson is
    // explicitly set to `undefined` by the sim (see
    // tile-delta-stringify-cache.ts). JSON.stringify drops object keys whose
    // value is `undefined`, so without coercion the client's
    // `"townJson" in update` clear-detection never sees the key and keeps
    // rendering the razed town (the bug reported as "captured settlement
    // remained after capture").
    const [result] = jsonSafeTileDeltaBatch([
      { x: 1, y: 2, townJson: undefined } as unknown as Parameters<typeof jsonSafeTileDeltaBatch>[0][number]
    ]);

    expect(result).toMatchObject({ x: 1, y: 2, townJson: "" });
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ townJson: "" });
  });

  it("leaves a defined townJson untouched", () => {
    const [result] = jsonSafeTileDeltaBatch([
      { x: 1, y: 2, townJson: "{\"type\":\"MARKET\"}" } as unknown as Parameters<typeof jsonSafeTileDeltaBatch>[0][number]
    ]);

    expect(result).toMatchObject({ townJson: "{\"type\":\"MARKET\"}" });
  });

  it("does not add townJson when the field is absent from the delta", () => {
    const [result] = jsonSafeTileDeltaBatch([
      { x: 1, y: 2, ownerId: "player-1" } as unknown as Parameters<typeof jsonSafeTileDeltaBatch>[0][number]
    ]);

    expect(result).not.toHaveProperty("townJson");
  });
});
