import { describe, expect, it } from "vitest";
import { confirmPromptOffer, confirmTapActionForTile, confirmTapActionId, confirmTapReady, createTapConfirm, neutralTileClickOutcome } from "./client-tile-interaction.js";

const adjacentNeutral = { isLand: true, isFogged: false, hasFrontierOrigin: true, isNeutral: true };

describe("neutralTileClickOutcome", () => {
  // Playtest 2026-11-17: one click/tap next to the border claimed the tile and
  // spent manpower with no preview, so testers got tiles they never chose.
  it("opens the sheet on the first tap of adjacent neutral land, for mouse and touch alike", () => {
    expect(neutralTileClickOutcome({ ...adjacentNeutral, confirmTap: false })).toBe("open-menu");
  });

  it("claims adjacent neutral land only on the confirming second tap", () => {
    expect(neutralTileClickOutcome({ ...adjacentNeutral, confirmTap: true })).toBe("queue-adjacent-neutral");
  });

  it("never claims non-adjacent, fogged, enemy or water tiles from a tap", () => {
    expect(neutralTileClickOutcome({ ...adjacentNeutral, hasFrontierOrigin: false, confirmTap: true })).toBe("open-menu");
    expect(neutralTileClickOutcome({ ...adjacentNeutral, isFogged: true, confirmTap: true })).toBe("open-menu");
    expect(neutralTileClickOutcome({ ...adjacentNeutral, isNeutral: false, confirmTap: true })).toBe("open-menu");
    expect(neutralTileClickOutcome({ ...adjacentNeutral, isLand: false, confirmTap: true })).toBe("open-menu");
  });
});

describe("createTapConfirm (select first, then confirm)", () => {
  it("selects on the first tap and confirms on a second tap of the same tile", () => {
    const tap = createTapConfirm();
    expect(tap.take(4, 5)).toBe(false); // first tap: select
    tap.arm(4, 5);
    expect(tap.take(4, 5)).toBe(true); // second tap on the same tile: confirm
  });

  it("does not confirm a third time: after a confirm the next tap selects again", () => {
    const tap = createTapConfirm();
    tap.arm(4, 5);
    expect(tap.take(4, 5)).toBe(true);
    expect(tap.take(4, 5)).toBe(false);
  });

  it("tapping another tile deselects: going back to the first tile selects it again", () => {
    const tap = createTapConfirm();
    tap.arm(4, 5);
    expect(tap.take(9, 9)).toBe(false);
    tap.arm(9, 9);
    expect(tap.take(4, 5)).toBe(false);
    expect(tap.armed()).toBeUndefined();
  });

  it("a tap that did not show the tile's actions (never armed) cannot be confirmed", () => {
    const tap = createTapConfirm();
    expect(tap.take(4, 5)).toBe(false);
    expect(tap.take(4, 5)).toBe(false);
  });

  it("an action button disarms, so a later tap on the tile does not spend again", () => {
    const tap = createTapConfirm();
    tap.arm(4, 5);
    tap.disarm();
    expect(tap.take(4, 5)).toBe(false);
  });
});

// Review of PR #2848 regressions.
describe("tap confirm guards", () => {
  it("a pan or zoom after the first tap lapses the arm: the next tap on the tile selects, never spends", () => {
    let view = "10,10,24";
    const tap = createTapConfirm(() => view);
    tap.arm(4, 5);
    view = "12,10,24"; // the player dragged the map (a pan never reaches take())
    expect(tap.take(4, 5)).toBe(false);
    tap.arm(4, 5);
    expect(tap.take(4, 5)).toBe(true); // unmoved view: the second tap still confirms
  });

  it("never fires Garrison (settle_land) on your own land, nor anything against a pact holder", () => {
    const garrison = [{ id: "settle_land" as const }];
    expect(confirmTapActionForTile(garrison, { ownTile: true, pactHolder: false })).toBeUndefined();
    expect(confirmTapActionForTile([{ id: "launch_attack" as const }], { ownTile: false, pactHolder: true })).toBeUndefined();
    expect(confirmTapActionForTile(garrison, { ownTile: false, pactHolder: false })?.id).toBe("settle_land"); // Expand To on neutral land
  });

  it("does not fire an attack whose preview (win chance, cost) is still loading", () => {
    expect(confirmTapReady({ loading: true })).toBe(false);
    expect(confirmTapReady({})).toBe(true);
    expect(confirmTapReady(undefined)).toBe(false);
  });
});

describe("confirmTapActionId", () => {
  it("fires the sheet's first enabled claim or attack", () => {
    expect(confirmTapActionId([{ id: "build_relay_beacon_frontier" }, { id: "settle_land" }])).toBe("settle_land");
    expect(confirmTapActionId([{ id: "expand_here" }])).toBe("expand_here");
    expect(confirmTapActionId([{ id: "launch_attack" }, { id: "attack_connected_region" }])).toBe("launch_attack");
  });

  it("does nothing when the claim or attack is disabled (cost not met) or the tile has none", () => {
    expect(confirmTapActionId([{ id: "launch_attack", disabled: true }])).toBeUndefined();
    expect(confirmTapActionId([{ id: "settle_land", disabled: true }, { id: "build_relay_beacon_frontier" }])).toBeUndefined();
    expect(confirmTapActionId([{ id: "abandon_territory" }, { id: "attack_connected_region" }])).toBeUndefined();
  });
});

describe("confirmPromptOffer", () => {
  it("shows the action and its cost once known", () => {
    expect(confirmPromptOffer({ label: "Launch Attack", cost: "est. 12 manpower" })).toEqual({ label: "Launch Attack", cost: "est. 12 manpower" });
  });

  // Coordinator follow-up on PR #2848: never a stale or wrong number on the button.
  it("shows the action without a number while the attack preview is still loading", () => {
    expect(confirmPromptOffer({ label: "Launch Attack", cost: "est. 99 manpower", loading: true })).toEqual({ label: "Launch Attack" });
    expect(confirmPromptOffer({ label: "Launch Attack", loading: true })).toEqual({ label: "Launch Attack" });
  });

  it("passes disabled through and nothing for no action", () => {
    expect(confirmPromptOffer({ label: "Expand To", disabled: true })).toEqual({ label: "Expand To", disabled: true });
    expect(confirmPromptOffer(undefined)).toBeUndefined();
  });
});
