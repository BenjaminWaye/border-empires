import { describe, expect, it } from "vitest";
import { setMusterCommandPayload, upgradeMusterCapCommandPayload } from "./set-muster-command-payload.js";

describe("setMusterCommandPayload", () => {
  it("forwards the flag's chosen commitment so the attack it fires uses it", () => {
    expect(setMusterCommandPayload({ x: 1, y: 2, mode: "MARCH", targetX: 3, targetY: 4, commitManpower: 120 })).toEqual({
      x: 1,
      y: 2,
      mode: "MARCH",
      targetX: 3,
      targetY: 4,
      commitManpower: 120
    });
  });

  it("omits optional fields the client didn't send", () => {
    expect(setMusterCommandPayload({ x: 1, y: 2, mode: "HOLD" })).toEqual({ x: 1, y: 2, mode: "HOLD" });
  });
});

describe("upgradeMusterCapCommandPayload", () => {
  it("forwards fitManpower so a big manual commitment can expand the flag to hold it", () => {
    expect(upgradeMusterCapCommandPayload({ x: 1, y: 2, fitManpower: 900 })).toEqual({ x: 1, y: 2, fitManpower: 900 });
  });

  it("stays a plain one-press upgrade without it", () => {
    expect(upgradeMusterCapCommandPayload({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });
});
