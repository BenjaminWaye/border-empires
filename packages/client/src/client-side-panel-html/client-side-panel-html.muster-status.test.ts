import { describe, expect, it } from "vitest";
import { musterFightIsClaim, musterStatusText } from "./client-side-panel-html.js";

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

// 2026-11-12 playtest (pt-predator): a MARCH walking down an empty beach read
// "Fighting at (534, 109)" because the server reports its neutral claim
// through the same fightX/fightY as an attack.
describe("march claim status", () => {
  const tiles = new Map<string, { ownerId?: string; fogged?: boolean }>([
    ["1,1", {}],
    ["2,2", { ownerId: "rival" }],
    ["3,3", { ownerId: "me" }],
    ["4,4", { fogged: true }]
  ]);
  const tileAt = (x: number, y: number) => tiles.get(`${x},${y}`);
  const flag = { mode: "MARCH" as const, amount: 100, x: 0, y: 0, inFlight: true };

  it("calls a neutral (or just-claimed) step a claim and an enemy or unseen one a fight", () => {
    expect(musterFightIsClaim({ inFlight: true, fightX: 1, fightY: 1 }, "me", tileAt)).toBe(true);
    expect(musterFightIsClaim({ inFlight: true, fightX: 3, fightY: 3 }, "me", tileAt)).toBe(true);
    expect(musterFightIsClaim({ inFlight: true, fightX: 2, fightY: 2 }, "me", tileAt)).toBe(false);
    expect(musterFightIsClaim({ inFlight: true, fightX: 4, fightY: 4 }, "me", tileAt)).toBe(false);
    expect(musterFightIsClaim({ inFlight: true, fightX: 9, fightY: 9 }, "me", tileAt)).toBe(false);
    expect(musterFightIsClaim({ inFlight: false, fightX: 1, fightY: 1 }, "me", tileAt)).toBe(false);
  });

  it("renders Claiming instead of Fighting", () => {
    expect(musterStatusText({ ...flag, fightX: 1, fightY: 1, fightClaim: true })).toBe("Claiming (1, 1).");
    expect(musterStatusText({ ...flag, fightX: 1, fightY: 1, fightClaim: true, inFlightCount: 3 })).toBe("Claiming (1, 1) (3 actions active).");
    expect(musterStatusText({ ...flag, fightX: 2, fightY: 2 })).toBe("Fighting at (2, 2).");
  });
});
