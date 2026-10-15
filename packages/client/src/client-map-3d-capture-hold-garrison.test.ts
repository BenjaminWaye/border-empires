import { afterEach, describe, expect, it } from "vitest";
import { buildCaptureHoldGarrisons, defenderGarrisonField, resetCaptureHoldGarrisonCache } from "./client-map-3d-capture-hold-garrison.js";
import type { ClientState } from "./client-state/client-state.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const NOW_EPOCH = 1_000_000;
const NOW = 5_000;

const makeState = (tiles: Tile[], activeBattles: ClientState["activeBattles"] = new Map()) => ({
  tiles: new Map(tiles.map((t) => [keyFor(t.x, t.y), t])),
  tilesRevision: 1,
  activeBattles
});

const held = (overrides: Partial<Tile> = {}): Tile => ({
  x: 10, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", captureHoldUntil: NOW_EPOCH + 30_000, ...overrides
});

const build = (state: ReturnType<typeof makeState>, busy: ReadonlySet<string> = new Set()) =>
  buildCaptureHoldGarrisons(state, keyFor, busy, () => "#123456", () => 0, 0, 0, NOW, NOW_EPOCH);

afterEach(() => resetCaptureHoldGarrisonCache());

describe("buildCaptureHoldGarrisons", () => {
  it("stands a squad on a visible held tile, facing in from its owner's neighbouring land", () => {
    const state = makeState([held(), { x: 9, y: 10, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" }]);
    const [garrison, ...rest] = build(state);
    expect(rest).toHaveLength(0);
    expect(garrison).toMatchObject({ fwdX: 1, fwdZ: 0, color: "#123456", hashSeed: 10 * 92821 + 10, endsAt: NOW + 30_000 });
  });

  it("faces the way the capture battle came in when one is on record", () => {
    const battles: ClientState["activeBattles"] = new Map([[keyFor(10, 10), {
      originX: 10, originY: 9, targetX: 10, targetY: 10, attackerOwnerId: "p1", defenderOwnerId: "p2",
      attackerWon: true, startAt: 0, clashAt: 0, endAt: 1, fromSkirmish: false
    }]]);
    const [garrison] = build(makeState([held()], battles));
    expect(garrison).toMatchObject({ fwdX: 0, fwdZ: 1 });
  });

  it("draws nothing while a fight is on the tile, on fogged or expired holds, or on garrisoned land", () => {
    expect(build(makeState([held()]), new Set([keyFor(10, 10)]))).toHaveLength(0);
    resetCaptureHoldGarrisonCache();
    expect(build(makeState([held({ fogged: true })]))).toHaveLength(0);
    resetCaptureHoldGarrisonCache();
    expect(build(makeState([held({ captureHoldUntil: NOW_EPOCH - 1 })]))).toHaveLength(0);
    resetCaptureHoldGarrisonCache();
    expect(build(makeState([held({ ownershipState: "SETTLED" })]))).toHaveLength(0);
  });
});

describe("defenderGarrisonField", () => {
  it("hands a fight on a held tile its standing garrison as defenders", () => {
    const state = makeState([held()]);
    expect(defenderGarrisonField(state, keyFor, keyFor(10, 10), "p1", NOW_EPOCH).defenderGarrison).toBeDefined();
  });

  it("gives no garrison to plain frontier or to someone else's tile", () => {
    const { captureHoldUntil: _unused, ...plain } = held();
    const state = makeState([plain]);
    expect(defenderGarrisonField(state, keyFor, keyFor(10, 10), "p1", NOW_EPOCH)).toEqual({});
    expect(defenderGarrisonField(makeState([held()]), keyFor, keyFor(10, 10), "p2", NOW_EPOCH)).toEqual({});
  });

  it("keeps the garrison for a fight that outlasts the hold window", () => {
    const state = makeState([held()]);
    defenderGarrisonField(state, keyFor, keyFor(10, 10), "p1", NOW_EPOCH);
    expect(defenderGarrisonField(state, keyFor, keyFor(10, 10), "p1", NOW_EPOCH + 60_000).defenderGarrison).toBeDefined();
  });
});
