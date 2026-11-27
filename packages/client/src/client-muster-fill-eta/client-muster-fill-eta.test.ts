// @vitest-environment happy-dom
// Owner request 2026-11-27: committing an attack that waits on a muster flag
// said nothing about how long the flag takes to fill or that it can be taken meanwhile.
import { MUSTER_BASE_RATE_PER_MIN } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { showEffortConfirmSheet, hideEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { attackFlagFillNote, fillDurationText, musterFillEtaMs, musterFillNote } from "./client-muster-fill-eta.js";

const land = (x: number, y: number, extra: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra });

describe("muster flag fill time", () => {
  it("turns the shortfall and the current refill rate into a terse line", () => {
    expect(musterFillEtaMs(180, 30, 1_000)).toBe(6 * 60_000);
    expect(musterFillNote(180, 30, 1_000)).toBe("Flag fills in ~6m · can be attacked while filling");
    expect(musterFillNote(180, 30, 100)).toBe("Flag waits for manpower · can be attacked while filling");
    expect(musterFillNote(0, 30, 1_000)).toBe("");
    expect(fillDurationText(20_000)).toBe("1m");
    expect(fillDurationText(65 * 60_000)).toBe("1h 5m");
  });

  it("times a new flag at its share of the muster rate, and a reused flag at its own rate", () => {
    const state = createInitialState();
    state.me = "me";
    state.manpower = 2_000;
    const origin = land(10, 10);
    const target = land(11, 10, { ownerId: "rival" });
    state.tiles.set("10,10", origin);
    state.tiles.set("11,10", target);
    // No flag anywhere: the new one gets the whole rate.
    expect(attackFlagFillNote(state, origin, target, MUSTER_BASE_RATE_PER_MIN * 3)).toBe("Flag fills in ~3m · can be attacked while filling");
    // A flag on the firing tile already holding 60 of 120, filling at 20/min.
    state.tiles.set("10,10", land(10, 10, { muster: { ownerId: "me", amount: 60, mode: "HOLD", updatedAt: 0, ratePerMin: 20 } }));
    expect(attackFlagFillNote(state, state.tiles.get("10,10"), target, 120)).toBe("Flag fills in ~3m · can be attacked while filling");
    // Enough staged already: nothing to wait for.
    expect(attackFlagFillNote(state, state.tiles.get("10,10"), target, 50)).toBe("");
  });

  it("shows on the effort sheet and hides when empty", () => {
    let note = "Flag fills in ~6m · can be attacked while filling";
    showEffortConfirmSheet({ title: "Attack", floor: 60, cap: 600, mode: "presets", note: () => note, onConfirm: () => undefined });
    const line = document.querySelector<HTMLElement>("[data-effort-fill]")!;
    expect(line.textContent).toBe(note);
    expect(line.hidden).toBe(false);
    note = "";
    document.querySelector<HTMLButtonElement>("[data-effort-preset=extra]")!.click();
    expect(line.hidden).toBe(true);
    hideEffortConfirmSheet();
  });
});
