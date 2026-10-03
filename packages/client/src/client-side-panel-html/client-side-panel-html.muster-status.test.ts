import { describe, expect, it } from "vitest";
import { musterStatusText } from "./client-side-panel-html.js";

const flag = { mode: "ADVANCE" as const, amount: 30, x: 5, y: 6 };

describe("musterStatusText unfundable target", () => {
  it("tells the player which tile is being skipped and why", () => {
    const text = musterStatusText({ ...flag, inFlight: true, fightX: 9, fightY: 9, unfundableTarget: { x: 7, y: 8, required: 960 } });
    expect(text).toBe("Fighting at (9, 9). Skipping (7, 8): needs 960 manpower, more than this flag can hold — use Expand Capacity.");
  });

  it("is unchanged when nothing is being skipped", () => {
    expect(musterStatusText({ ...flag, inFlight: true, fightX: 9, fightY: 9 })).toBe("Fighting at (9, 9).");
  });
});
