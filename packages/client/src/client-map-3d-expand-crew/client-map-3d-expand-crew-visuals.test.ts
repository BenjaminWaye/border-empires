import { describe, expect, it, vi } from "vitest";
import type { Scene } from "three";
import type { ClientState } from "../client-state/client-state.js";

const update = vi.fn();
vi.mock("./client-map-3d-expand-crew-soldiers.js", () => ({
  createExpandCrewSoldiers: () => ({ update, dispose: vi.fn() })
}));

const { createFrontierClaimVisuals } = await import("./client-map-3d-expand-crew.js");

const keyFor = (x: number, y: number) => `${x},${y}`;
const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;
const gate = { recordFrame: () => {}, shouldAnimate: () => true, prefersReducedMotion: () => false };

const stateWith = (overrides: Partial<ClientState>): ClientState =>
  ({
    me: "me",
    playerColors: new Map([["me", "#00ff00"]]),
    outgoingMusterAttacksByTile: new Map(),
    incomingAttacksByTile: new Map(),
    capture: undefined,
    tiles: new Map(),
    tilesRevision: 1,
    playerCosmetics: new Map(),
    ...overrides
  }) as unknown as ClientState;

const sync = (state: ClientState, ownerColor: string): void => {
  const visuals = createFrontierClaimVisuals({} as Scene, undefined, gate);
  visuals.sync(state, keyFor, heightfield, 0, 0, 0, (x) => x, (y) => y, () => false, ownerColor);
};

describe("createFrontierClaimVisuals", () => {
  // Regression: the 3D crew was tinted with the raw playerColors entry, so
  // with the diplomacy lens on it walked out in a different colour from the
  // muster company that marched there and from the 2D crew.
  it("tints the crew with the map's lens-aware owner colour, not the raw player colour", () => {
    update.mockClear();
    const now = Date.now();
    sync(stateWith({ capture: { startAt: now, resolvesAt: now + 7_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" } }), "#abcdef");

    const [placed, , , armour, color] = update.mock.calls[0]!;
    expect(placed).toHaveLength(1);
    expect(color).toBe("#abcdef");
    expect(armour).toBe("standard");
  });

  it("dresses the crew in heavy armour with a Titanium Weapons Factory", () => {
    update.mockClear();
    const now = Date.now();
    sync(
      stateWith({
        tilesRevision: 2,
        capture: { startAt: now, resolvesAt: now + 7_500, target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, actionType: "EXPAND" },
        tiles: new Map([["9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "me", economicStructure: { type: "TITANIUM_WEAPONS_FACTORY" } }]]) as never
      }),
      "#abcdef"
    );
    expect(update.mock.calls[0]![3]).toBe("heavy");
  });

  it("doesn't read gear when no claim has a crew", () => {
    update.mockClear();
    sync(
      stateWith({
        tilesRevision: 3,
        tiles: new Map([["9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "me", economicStructure: { type: "TITANIUM_WEAPONS_FACTORY" } }]]) as never
      }),
      "#abcdef"
    );
    expect(update.mock.calls[0]![0]).toEqual([]);
    expect(update.mock.calls[0]![3]).toBe("standard");
  });
});
