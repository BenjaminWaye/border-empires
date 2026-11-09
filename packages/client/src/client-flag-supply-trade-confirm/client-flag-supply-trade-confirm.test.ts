import { describe, expect, it, vi } from "vitest";
import { MUSTER_ADVANCE_RANGE_STEPS, type ResourceSupplyAgreementStatus } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { advanceReachOwnerIds, advanceSupplyTradeWarning, confirmSupplyTradeEnd } from "./client-flag-supply-trade-confirm.js";

const trade = (other: string): ResourceSupplyAgreementStatus =>
  ({ id: `me-${other}`, proposerId: "me", targetId: other, proposerGives: { FOOD: 1 }, targetGives: {}, startedAt: 1, fulfilled: true });

/** A row of land along y = 5: our flag at x = 5, neutral land, then `owner`'s tile at `ownerX`. */
const world = (ownerX: number, owner = "rival", extra: Tile[] = []) => {
  const state = createInitialState();
  state.me = "me";
  state.playerNames.set("rival", "House Rival");
  for (let x = 5; x < ownerX; x += 1) state.tiles.set(`${x},5`, { x, y: 5, terrain: "LAND", ...(x === 5 ? { ownerId: "me" } : {}) });
  state.tiles.set(`${ownerX},5`, { x: ownerX, y: 5, terrain: "LAND", ownerId: owner, ownershipState: "SETTLED" });
  for (const tile of extra) state.tiles.set(`${tile.x},${tile.y}`, tile);
  return state;
};

describe("advanceReachOwnerIds", () => {
  it("finds a House across neutral land within the advance range", () => {
    expect(advanceReachOwnerIds(world(9), 5, 5)).toEqual(["rival"]);
  });
  it("ignores Houses beyond the range, behind water, allied or truced", () => {
    expect(advanceReachOwnerIds(world(40), 5, 5)).toEqual([]);
    const blocked = world(9);
    // A sea column: no land way round it.
    for (let y = 0; y <= 10; y += 1) blocked.tiles.set(`7,${y}`, { x: 7, y, terrain: "SEA" });
    for (const x of [6, 8]) for (const y of [4, 6]) blocked.tiles.set(`${x},${y}`, { x, y, terrain: "LAND" });
    expect(advanceReachOwnerIds(blocked, 5, 5)).toEqual([]);
    const allied = world(9);
    allied.allies = ["rival"];
    expect(advanceReachOwnerIds(allied, 5, 5)).toEqual([]);
    const truced = world(9);
    truced.activeTruces = [{ otherPlayerId: "rival", otherPlayerName: "Rival", startedAt: 1, endsAt: Date.now() + 60_000, createdByPlayerId: "me" }];
    expect(advanceReachOwnerIds(truced, 5, 5)).toEqual([]);
  });
});

describe("advanceReachOwnerIds range and crossings", () => {
  it("reaches a House exactly MUSTER_ADVANCE_RANGE_STEPS away, not one more", () => {
    expect(advanceReachOwnerIds(world(5 + MUSTER_ADVANCE_RANGE_STEPS), 5, 5)).toEqual(["rival"]);
    expect(advanceReachOwnerIds(world(6 + MUSTER_ADVANCE_RANGE_STEPS), 5, 5)).toEqual([]);
  });
  it("walks fogged neutral land but ignores fogged or unclaimed-state hostile tiles", () => {
    const state = world(9);
    state.tiles.set("7,5", { x: 7, y: 5, terrain: "LAND", fogged: true });
    expect(advanceReachOwnerIds(state, 5, 5)).toEqual(["rival"]);
    state.tiles.set("9,5", { x: 9, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "SETTLED", fogged: true });
    expect(advanceReachOwnerIds(state, 5, 5)).toEqual([]);
    state.tiles.set("9,5", { x: 9, y: 5, terrain: "LAND", ownerId: "rival" });
    expect(advanceReachOwnerIds(state, 5, 5)).toEqual([]);
  });
  it("crosses from one of our docks to the linked dock's landing ground", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set("5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me" });
    for (let x = 6; x <= 30; x += 1) state.tiles.set(`${x},5`, { x, y: 5, terrain: "SEA" });
    state.tiles.set("31,5", { x: 31, y: 5, terrain: "LAND" });
    state.tiles.set("32,5", { x: 32, y: 5, terrain: "LAND", ownerId: "rival", ownershipState: "FRONTIER" });
    expect(advanceReachOwnerIds(state, 5, 5)).toEqual([]);
    state.dockPairs = [{ ax: 5, ay: 5, bx: 31, by: 5 }];
    expect(advanceReachOwnerIds(state, 5, 5)).toEqual(["rival"]);
  });
});

describe("advanceSupplyTradeWarning", () => {
  it("names a trade partner in the flag's reach only", () => {
    const state = world(9);
    expect(advanceSupplyTradeWarning(state, 5, 5)).toBeUndefined();
    state.resourceTradeAgreements = [trade("rival")];
    expect(advanceSupplyTradeWarning(state, 5, 5)).toBe("Attacking ends your 1 supply trade with House Rival");
    const far = world(40);
    far.resourceTradeAgreements = [trade("rival")];
    expect(advanceSupplyTradeWarning(far, 5, 5)).toBeUndefined();
  });
});

describe("confirmSupplyTradeEnd", () => {
  it("proceeds at once without a warning, and only on confirm with one", () => {
    const proceed = vi.fn();
    const show = vi.fn(() => true);
    confirmSupplyTradeEnd(undefined, "Advance", proceed, show);
    expect(show).not.toHaveBeenCalled();
    expect(proceed).toHaveBeenCalledTimes(1);
    confirmSupplyTradeEnd("Attacking ends your 1 supply trade with X", "Advance", proceed, show);
    expect(proceed).toHaveBeenCalledTimes(1);
    const options = (show.mock.calls[0] as unknown as [{ title: string; confirmLabel: string; onConfirm: () => void }])[0];
    expect(options).toMatchObject({ title: "End supply trades?", confirmLabel: "Advance" });
    options.onConfirm();
    expect(proceed).toHaveBeenCalledTimes(2);
  });
  it("still proceeds when no sheet can be shown", () => {
    const proceed = vi.fn();
    confirmSupplyTradeEnd("warning", "March", proceed, () => false);
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
