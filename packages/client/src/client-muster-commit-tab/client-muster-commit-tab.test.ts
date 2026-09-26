import { describe, expect, it } from "vitest";
import { buildMusterCommitView, musterCommitPresetAmount } from "./client-muster-commit-tab.js";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const makeTile = (overrides: Partial<Tile>): Tile => ({
  x: 0,
  y: 0,
  terrain: "LAND",
  ...overrides
});

const deps = { me: "me", keyFor: (x: number, y: number) => `${x},${y}` };

describe("musterCommitPresetAmount", () => {
  it("scales normal/extra/double at 1x/1.5x/2x the floor, rounding up", () => {
    expect(musterCommitPresetAmount("normal", 60)).toBe(60);
    expect(musterCommitPresetAmount("extra", 60)).toBe(90);
    expect(musterCommitPresetAmount("double", 60)).toBe(120);
    expect(musterCommitPresetAmount("extra", 61)).toBe(92); // ceil(91.5)
  });
});

describe("buildMusterCommitView", () => {
  it("returns undefined for a tile with no muster flag", () => {
    const state = createInitialState();
    const tile = makeTile({ x: 5, y: 5 });
    expect(buildMusterCommitView(tile, state, deps)).toBeUndefined();
  });

  it("returns undefined for a flag owned by someone else", () => {
    const state = createInitialState();
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "enemy", amount: 100, mode: "HOLD", updatedAt: 0 } });
    expect(buildMusterCommitView(tile, state, deps)).toBeUndefined();
  });

  it("uses the generic MUSTER_ATTACK_COST floor (60) when no target is set", () => {
    const state = createInitialState();
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "me", amount: 100, mode: "HOLD", updatedAt: 0 } });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.floor).toBe(60);
    expect(view?.hasTarget).toBe(false);
    expect(view?.commitManpower).toBe(60); // defaults to the floor
  });

  it("uses the target fort's requiredMusterForFort as the floor when a target is set", () => {
    const state = createInitialState();
    state.tiles.set(
      "6,5",
      makeTile({ x: 6, y: 5, ownerId: "enemy", ownershipState: "SETTLED", fort: { ownerId: "enemy", status: "active", variant: "FORT" } })
    );
    const tile = makeTile({
      x: 5,
      y: 5,
      muster: { ownerId: "me", amount: 500, mode: "MARCH", targetX: 6, targetY: 5, updatedAt: 0 }
    });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.hasTarget).toBe(true);
    expect(view?.floor).toBe(300); // requiredMusterForFort("FORT")
  });

  it("caps the slider at the player's manpower cap, never below the floor", () => {
    const state = createInitialState();
    state.manpowerCap = 500;
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "me", amount: 100, mode: "HOLD", updatedAt: 0 } });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.cap).toBe(500);
  });

  it("clamps a previously saved commitManpower into [floor, cap]", () => {
    const state = createInitialState();
    state.manpowerCap = 200;
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "me", amount: 500, mode: "HOLD", updatedAt: 0, commitManpower: 5_000 } });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.commitManpower).toBe(200); // clamped down to cap
  });

  it("computes preset amounts relative to the floor, capped at the manpower cap", () => {
    const state = createInitialState();
    state.manpowerCap = 100; // below double's 120 for a 60 floor
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "me", amount: 500, mode: "HOLD", updatedAt: 0 } });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.presets).toEqual([
      { key: "normal", label: "Normal", amount: 60 },
      { key: "extra", label: "Extra", amount: 90 },
      { key: "double", label: "Double", amount: 100 } // capped from 120
    ]);
  });

  it("leaves winChancePercent/baseWinChancePercent undefined when no target is set", () => {
    const state = createInitialState();
    const tile = makeTile({ x: 5, y: 5, muster: { ownerId: "me", amount: 100, mode: "HOLD", updatedAt: 0 } });
    const view = buildMusterCommitView(tile, state, deps);
    expect(view?.winChancePercent).toBeUndefined();
    expect(view?.baseWinChancePercent).toBeUndefined();
  });

  it("reports win chance from an already-cached ATTACK_PREVIEW for the origin/target pair", () => {
    const state = createInitialState();
    state.tiles.set("6,5", makeTile({ x: 6, y: 5, ownerId: "enemy", ownershipState: "SETTLED" }));
    const originTile = makeTile({ x: 5, y: 5, ownerId: "me", muster: { ownerId: "me", amount: 500, mode: "MARCH", targetX: 6, targetY: 5, updatedAt: 0 } });
    state.tiles.set("5,5", originTile);
    state.attackPreviewCacheByKey.set("5,5->6,5", { fromKey: "5,5", toKey: "6,5", valid: true, winChance: 0.5, receivedAt: Date.now() });
    const view = buildMusterCommitView(originTile, state, { me: "me", keyFor: deps.keyFor });
    // floor (no fort) = 60, commitManpower defaults to floor -> multiplier 1x -> 50%.
    expect(view?.baseWinChancePercent).toBe(50);
    expect(view?.winChancePercent).toBe(50);
  });

  // Regression: this view builder must always use THIS flag's own tile as
  // the attack origin, never a generic "nearest owned tile" heuristic --
  // otherwise it would look up the wrong ATTACK_PREVIEW cache entry (or none
  // at all) whenever some other owned tile happens to be closer to the
  // target than the flag itself.
  it("ignores a cached preview keyed by a different origin tile, even one closer to the target", () => {
    const state = createInitialState();
    state.tiles.set("6,5", makeTile({ x: 6, y: 5, ownerId: "enemy", ownershipState: "SETTLED" }));
    const closerTile = makeTile({ x: 6, y: 4, ownerId: "me" });
    state.tiles.set("6,4", closerTile);
    const flagTile = makeTile({ x: 5, y: 5, ownerId: "me", muster: { ownerId: "me", amount: 500, mode: "MARCH", targetX: 6, targetY: 5, updatedAt: 0 } });
    state.tiles.set("5,5", flagTile);
    // A preview cached for the closer tile's own hover, not the flag's.
    state.attackPreviewCacheByKey.set("6,4->6,5", { fromKey: "6,4", toKey: "6,5", valid: true, winChance: 0.9, receivedAt: Date.now() });
    const view = buildMusterCommitView(flagTile, state, { me: "me", keyFor: deps.keyFor });
    expect(view?.winChancePercent).toBeUndefined();
  });
});
