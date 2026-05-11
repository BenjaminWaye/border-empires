import { describe, expect, it } from "vitest";

import { createInlineSnapshotStringifier } from "./snapshot-stringifier.js";

describe("createInlineSnapshotStringifier", () => {
  it("returns the same JSON.stringify output as the built-in", async () => {
    const stringify = createInlineSnapshotStringifier();
    const value = { a: 1, b: ["x", "y"], c: { d: null } };
    expect(await stringify(value)).toBe(JSON.stringify(value));
  });
});
