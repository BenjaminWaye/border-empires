import { describe, expect, it } from "vitest";

import { resolveBoxSelectionMouseUpAction } from "./client-map-input.js";

describe("resolveBoxSelectionMouseUpAction", () => {
  it("does nothing when the drag selection is empty", () => {
    expect(resolveBoxSelectionMouseUpAction([])).toEqual({ type: "none" });
  });

  it("opens the bulk menu instead of auto-queuing neutral frontier tiles", () => {
    expect(resolveBoxSelectionMouseUpAction(["358,180", "358,179", "358,178"])).toEqual({
      type: "open-bulk-menu",
      targetKeys: ["358,180", "358,179", "358,178"]
    });
  });
});
