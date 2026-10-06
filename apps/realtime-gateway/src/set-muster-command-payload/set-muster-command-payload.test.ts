import { describe, expect, it } from "vitest";
import { setMusterCommandPayload } from "./set-muster-command-payload.js";

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
