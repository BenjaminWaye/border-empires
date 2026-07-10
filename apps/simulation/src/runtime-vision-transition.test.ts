import { describe, expect, it } from "vitest";
import { VisionTransitionAccumulator } from "./runtime-vision-transition.js";

describe("VisionTransitionAccumulator", () => {
  it("cancels a same-tick enter+leave for the same tile instead of reporting a false fog transition", () => {
    // Regression for the "everything fogged" bug: resyncVisionRadius (fired
    // when a tech/domain pick changes a player's vision radius, e.g.
    // cartography's visionRadiusBonus) calls onLeave for the player's ENTIRE
    // old-radius territory, then onEnter for their entire new-radius
    // territory, synchronously, in the same tick. Old and new radius overlap
    // almost completely, so nearly every tile in the player's territory gets
    // BOTH an onLeave and an onEnter this tick -- net effect: still visible,
    // nothing actually changed. But if the two edges are tracked as
    // independent sets, the tile ends up wrongly reported as "left vision"
    // (see tile-delta-visibility-stamp.ts, which treats leftVisionTileKeys
    // membership as an unconditional FOG stamp with no entered-set check),
    // fog-freezing the client's view of a tile that was visible the whole
    // time.
    const accumulator = new VisionTransitionAccumulator();
    accumulator.callbacks.onLeave("player-1", "10,10");
    accumulator.callbacks.onEnter("player-1", "10,10");

    const { entered, left } = accumulator.take();

    expect(left.get("player-1")?.has("10,10")).not.toBe(true);
    expect(entered.get("player-1")?.has("10,10")).not.toBe(true);
  });

  it("still reports a genuine leave when no matching enter follows", () => {
    const accumulator = new VisionTransitionAccumulator();
    accumulator.callbacks.onLeave("player-1", "20,20");

    const { left } = accumulator.take();

    expect(left.get("player-1")?.has("20,20")).toBe(true);
  });

  it("still reports a genuine enter when no matching leave precedes it", () => {
    const accumulator = new VisionTransitionAccumulator();
    accumulator.callbacks.onEnter("player-1", "30,30");

    const { entered } = accumulator.take();

    expect(entered.get("player-1")?.has("30,30")).toBe(true);
  });

  it("cancels regardless of enter/leave order within the same window", () => {
    const accumulator = new VisionTransitionAccumulator();
    accumulator.callbacks.onEnter("player-1", "40,40");
    accumulator.callbacks.onLeave("player-1", "40,40");

    const { entered, left } = accumulator.take();

    expect(left.get("player-1")?.has("40,40")).not.toBe(true);
    expect(entered.get("player-1")?.has("40,40")).not.toBe(true);
  });

  it("does not cross-contaminate different viewers", () => {
    const accumulator = new VisionTransitionAccumulator();
    accumulator.callbacks.onLeave("player-1", "50,50");
    accumulator.callbacks.onEnter("player-2", "50,50");

    const { entered, left } = accumulator.take();

    expect(left.get("player-1")?.has("50,50")).toBe(true);
    expect(entered.get("player-2")?.has("50,50")).toBe(true);
  });
});
