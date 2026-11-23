import { describe, expect, it, vi } from "vitest";
import { createUnsettleEncirclementScope } from "./unsettle-encirclement.js";

const setup = () => {
  const applyEncirclement = vi.fn();
  return { applyEncirclement, unsettle: createUnsettleEncirclementScope({ applyEncirclement }) };
};

describe("createUnsettleEncirclementScope", () => {
  it("checks each owner's unsettled tiles when the scope ends, with the overtaking participant as claimant", () => {
    const { applyEncirclement, unsettle } = setup();

    unsettle.scope(["player-1"], "cmd", () => {
      unsettle.record("1,1", "player-2", "player-1");
      unsettle.record("2,1", "player-2", "player-1");
      unsettle.record("3,1", "player-3", "player-1");
      expect(applyEncirclement).not.toHaveBeenCalled();
    });

    expect(applyEncirclement).toHaveBeenCalledTimes(2);
    expect(applyEncirclement).toHaveBeenCalledWith(["1,1", "2,1"], "player-2", "cmd", { claimantId: "player-1" });
    expect(applyEncirclement).toHaveBeenCalledWith(["3,1"], "player-3", "cmd", { claimantId: "player-1" });
  });

  it("charges a vacated border to the acting player", () => {
    const { applyEncirclement, unsettle } = setup();

    unsettle.scope(["player-1", "player-2"], "cmd", () => unsettle.record("2,2", "player-2", ""));

    expect(applyEncirclement).toHaveBeenCalledWith(["2,2"], "player-2", "cmd", { claimantId: "player-1" });
  });

  it("ignores unsettles outside a scope, by non-participants, barbarian land and self-overtakes", () => {
    const { applyEncirclement, unsettle } = setup();

    unsettle.record("0,0", "player-2", "player-1");
    unsettle.scope(["player-1"], "cmd", () => {
      unsettle.record("1,1", "player-2", "player-3");
      unsettle.record("2,2", "player-1", "");
      unsettle.record("3,3", "barbarian-1", "player-1");
      unsettle.record("4,4", "player-1", "player-1");
      unsettle.record("5,5", undefined, "player-1");
    });

    expect(applyEncirclement).not.toHaveBeenCalled();
  });

  it("keeps nested scopes' records apart and drains each with its own command", () => {
    const { applyEncirclement, unsettle } = setup();

    unsettle.scope(["player-1"], "outer", () => {
      unsettle.scope(["player-4"], "inner", () => {
        unsettle.record("1,1", "player-2", "player-4");
        unsettle.record("2,2", "player-2", "player-1");
      });
      unsettle.record("3,3", "player-2", "player-1");
    });

    expect(applyEncirclement.mock.calls).toEqual([
      [["1,1"], "player-2", "inner", { claimantId: "player-4" }],
      [["3,3"], "player-2", "outer", { claimantId: "player-1" }]
    ]);
  });

  it("records the owner read before the downgrade ran", () => {
    const { applyEncirclement, unsettle } = setup();
    let owner: string | undefined = "player-2";

    unsettle.scope(["player-1"], "cmd", () => {
      unsettle.downgrade("1,1", owner, "player-1", () => { owner = "player-9"; });
    });

    expect(applyEncirclement).toHaveBeenCalledWith(["1,1"], "player-2", "cmd", { claimantId: "player-1" });
  });
});
