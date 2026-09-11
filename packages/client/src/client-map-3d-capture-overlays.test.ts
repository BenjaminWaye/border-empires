import { describe, expect, it } from "vitest";

import { syncFrontierClaimPlates } from "./client-map-3d-capture-overlays.js";
import type { ClientState } from "./client-state/client-state.js";

const keyFor = (x: number, y: number) => `${x},${y}`;
const wrapX = (x: number) => x;
const wrapY = (y: number) => y;
const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;

type FakePlate = { visible: boolean; scale: { set: (x: number, y: number, z: number) => void }; position: { set: (x: number, y: number, z: number) => void }; material: { color: { set: (c: string) => void }; opacity: number } };

const createPlate = (): FakePlate => ({
  visible: false,
  scale: { set: () => {} },
  position: { set: () => {} },
  material: { color: { set: () => {} }, opacity: 0 }
});

const createPool = (size: number): FakePlate[] => Array.from({ length: size }, createPlate);

const createState = (overrides: Partial<ClientState>): ClientState =>
  ({
    me: "me",
    playerColors: new Map([["me", "#00ff00"]]),
    outgoingMusterAttacksByTile: new Map(),
    capture: undefined,
    ...overrides
  }) as unknown as ClientState;

const sync = (state: ClientState, plates: FakePlate[]): void =>
  syncFrontierClaimPlates(state, keyFor, heightfield, plates as never, 0, 0, 0, wrapX, wrapY);

describe("frontier claim plate sourcing", () => {
  it("renders a plate for this client's own manually-dispatched EXPAND claim", () => {
    const state = createState({
      capture: { startAt: 0, resolvesAt: Date.now() + 5_000, target: { x: 5, y: 5 }, actionType: "EXPAND" }
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates[0]?.visible).toBe(true);
    expect(plates[1]?.visible).toBe(false);
  });

  it("does not render a plate for a manual ATTACK claim", () => {
    const state = createState({
      capture: { startAt: 0, resolvesAt: Date.now() + 5_000, target: { x: 5, y: 5 }, actionType: "ATTACK" }
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates.every((p) => !p.visible)).toBe(true);
  });

  // REGRESSION: a muster flag's ADVANCE/MARCH auto-fired EXPAND never
  // occupies the single-slot `capture` field (the server dispatches it
  // without this client submitting anything -- see
  // handleMusterAdvanceExpandAccepted in client-siege-tracking.ts), so the
  // claim plate -- which used to read exclusively from `capture` -- never
  // rendered for it at all, even though the marching-company travel
  // animation played correctly on the way there.
  it("renders a plate for a muster flag's auto-fired EXPAND claim", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 5_000, isExpand: true }]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates[0]?.visible).toBe(true);
    expect(plates[1]?.visible).toBe(false);
  });

  it("does not render a claim plate while the muster flag's company is still marching there", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        [
          "5,5",
          {
            originX: 4,
            originY: 5,
            targetX: 5,
            targetY: 5,
            resolvesAt: Date.now() + 10_000,
            isExpand: true,
            transitEndsAt: Date.now() + 5_000,
            musterOriginX: 0,
            musterOriginY: 5
          }
        ]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates.every((p) => !p.visible)).toBe(true);
  });

  it("renders a plate once the muster flag's travel leg has ended and the claim itself has started", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        [
          "5,5",
          {
            originX: 4,
            originY: 5,
            targetX: 5,
            targetY: 5,
            resolvesAt: Date.now() + 5_000,
            isExpand: true,
            transitEndsAt: Date.now() - 1_000,
            musterOriginX: 0,
            musterOriginY: 5
          }
        ]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates[0]?.visible).toBe(true);
  });

  it("does not render a claim plate for a muster flag's auto-fired ATTACK", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 5_000 }]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates.every((p) => !p.visible)).toBe(true);
  });

  it("renders one plate per concurrent claim, without one target overwriting another", () => {
    const state = createState({
      capture: { startAt: 0, resolvesAt: Date.now() + 5_000, target: { x: 1, y: 1 }, actionType: "EXPAND" },
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 5_000, isExpand: true }],
        ["9,9", { originX: 8, originY: 9, targetX: 9, targetY: 9, resolvesAt: Date.now() + 5_000, isExpand: true }]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates.filter((p) => p.visible)).toHaveLength(3);
    expect(plates[3]?.visible).toBe(false);
  });

  it("does not double-render a muster claim that's also this client's own tracked capture", () => {
    // Same target tile in both sources (an edge case, not the normal path):
    // the manual capture should win rather than drawing two plates on one
    // tile.
    const state = createState({
      capture: { startAt: 0, resolvesAt: Date.now() + 5_000, target: { x: 5, y: 5 }, actionType: "EXPAND" },
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() + 5_000, isExpand: true }]
      ])
    });
    const plates = createPool(4);

    sync(state, plates);

    expect(plates.filter((p) => p.visible)).toHaveLength(1);
  });

  it("hides all pool plates once every claim has resolved", () => {
    const state = createState({
      outgoingMusterAttacksByTile: new Map([
        ["5,5", { originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: Date.now() - 1_000, isExpand: true }]
      ])
    });
    const plates = createPool(4);
    plates[0]!.visible = true;

    sync(state, plates);

    expect(plates.every((p) => !p.visible)).toBe(true);
  });
});
