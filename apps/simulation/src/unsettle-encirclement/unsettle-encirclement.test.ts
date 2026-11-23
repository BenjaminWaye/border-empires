import { describe, expect, it, vi } from "vitest";
import { createUnsettleEncirclementQueue } from "./unsettle-encirclement.js";

describe("createUnsettleEncirclementQueue", () => {
  it("defers checks recorded inside a write until the outermost write ends, batched per owner and claimant", () => {
    const applyEncirclement = vi.fn();
    const queue = createUnsettleEncirclementQueue({ applyEncirclement });

    queue.write(() => {
      queue.write(() => queue.record("1,1", "player-2", "player-1", "cmd"));
      queue.record("2,1", "player-2", "player-1", "cmd");
      queue.record("3,1", "player-3", "", "cmd");
      expect(applyEncirclement).not.toHaveBeenCalled();
    });

    expect(applyEncirclement).toHaveBeenCalledTimes(2);
    expect(applyEncirclement).toHaveBeenCalledWith(["1,1", "2,1"], "player-2", "cmd", { claimantId: "player-1" });
    expect(applyEncirclement).toHaveBeenCalledWith(["3,1"], "player-3", "cmd", undefined);
  });

  it("checks right away outside a write and ignores barbarian land", () => {
    const applyEncirclement = vi.fn();
    const queue = createUnsettleEncirclementQueue({ applyEncirclement });

    queue.record("4,4", "barbarian-1", "player-1", "cmd");
    queue.record("5,5", "player-2", "player-1", "cmd");

    expect(applyEncirclement).toHaveBeenCalledTimes(1);
    expect(applyEncirclement).toHaveBeenCalledWith(["5,5"], "player-2", "cmd", { claimantId: "player-1" });
  });
});
