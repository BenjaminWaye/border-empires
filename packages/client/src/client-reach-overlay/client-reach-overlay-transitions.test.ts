import { describe, expect, it } from "vitest";
import {
  ARRIVE_LASER_ON_MS,
  ARRIVE_RISE_MS,
  ARRIVE_TOTAL_MS,
  createTransitionTracker,
  diffTransitions,
  RETIRE_LASER_FADE_MS,
  RETIRE_SINK_MS,
  RETIRE_TOTAL_MS
} from "./client-reach-overlay-transitions.js";

const STAGGER_MS = 100;

type Point = { x: number; y: number };

describe("diffTransitions", () => {
  it("lands a brand-new set on idle (fully risen, full laser) on the very first call by default -- nothing to animate in with no prior state", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    const out = diffTransitions(current, tracker, 0, { animateInitial: false });
    expect(out.get("1,1")).toEqual({ x: 1, y: 1, riseFraction: 1, laserFraction: 1 });
  });

  it("animates a genuinely new key in (arriving) when animateInitial is left at its default", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    const out = diffTransitions(current, tracker, 0);
    const frame = out.get("1,1")!;
    expect(frame.riseFraction).toBe(0); // t=0 of the rise
    expect(frame.laserFraction).toBe(0);
  });

  it("an arriving pylon rises fully before its laser starts turning on", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    diffTransitions(current, tracker, 0);

    const midRise = diffTransitions(current, tracker, ARRIVE_RISE_MS / 2).get("1,1")!;
    expect(midRise.riseFraction).toBeGreaterThan(0);
    expect(midRise.riseFraction).toBeLessThan(1);
    expect(midRise.laserFraction).toBe(0);

    const justRisen = diffTransitions(current, tracker, ARRIVE_RISE_MS).get("1,1")!;
    expect(justRisen.riseFraction).toBe(1);
    expect(justRisen.laserFraction).toBe(0);

    const midLaser = diffTransitions(current, tracker, ARRIVE_RISE_MS + ARRIVE_LASER_ON_MS / 2).get("1,1")!;
    expect(midLaser.riseFraction).toBe(1);
    expect(midLaser.laserFraction).toBeGreaterThan(0);
    expect(midLaser.laserFraction).toBeLessThan(1);
  });

  it("settles an arriving pylon to idle (full rise, full laser) once its transition completes, and stays there", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    diffTransitions(current, tracker, 0);
    const settled = diffTransitions(current, tracker, ARRIVE_TOTAL_MS + 1).get("1,1")!;
    expect(settled.riseFraction).toBe(1);
    expect(settled.laserFraction).toBe(1);
    // A later call (well past settling) must not regress or replay the animation.
    const stillSettled = diffTransitions(current, tracker, ARRIVE_TOTAL_MS + 10_000).get("1,1")!;
    expect(stillSettled).toEqual({ x: 1, y: 1, riseFraction: 1, laserFraction: 1 });
  });

  it("retires a key that dropped out of current: laser fades first, then it sinks", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    // First call: land it on idle so this test isolates retirement, not arrival.
    diffTransitions(current, tracker, 0, { animateInitial: false });

    const empty = new Map<string, Point>();
    const justRetiring = diffTransitions(empty, tracker, 0)!.get("1,1")!;
    expect(justRetiring.riseFraction).toBe(1);
    expect(justRetiring.laserFraction).toBe(1); // t=0 of the fade

    const midFade = diffTransitions(empty, tracker, RETIRE_LASER_FADE_MS / 2).get("1,1")!;
    expect(midFade.riseFraction).toBe(1); // still standing
    expect(midFade.laserFraction).toBeGreaterThan(0);
    expect(midFade.laserFraction).toBeLessThan(1);

    const laserOff = diffTransitions(empty, tracker, RETIRE_LASER_FADE_MS).get("1,1")!;
    expect(laserOff.riseFraction).toBe(1);
    expect(laserOff.laserFraction).toBe(0);

    const midSink = diffTransitions(empty, tracker, RETIRE_LASER_FADE_MS + RETIRE_SINK_MS / 2).get("1,1")!;
    expect(midSink.riseFraction).toBeGreaterThan(0);
    expect(midSink.riseFraction).toBeLessThan(1);
    expect(midSink.laserFraction).toBe(0);
  });

  it("drops a fully-retired key from the tracker and stops returning it -- never lingers forever", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    diffTransitions(current, tracker, 0, { animateInitial: false });
    const empty = new Map<string, Point>();
    diffTransitions(empty, tracker, 0);
    const afterComplete = diffTransitions(empty, tracker, RETIRE_TOTAL_MS + 1);
    expect(afterComplete.has("1,1")).toBe(false);
    expect(tracker.has("1,1")).toBe(false);
  });

  it("resurrects a mid-retirement key as a fresh arrival instead of snapping back to full height", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 1, y: 1 }]]);
    diffTransitions(current, tracker, 0, { animateInitial: false });
    const empty = new Map<string, Point>();
    diffTransitions(empty, tracker, 0);
    // Partway through sinking...
    diffTransitions(empty, tracker, RETIRE_LASER_FADE_MS + RETIRE_SINK_MS / 2);
    // ...it reappears in `current` before finishing.
    const resurrected = diffTransitions(current, tracker, RETIRE_LASER_FADE_MS + RETIRE_SINK_MS / 2).get("1,1")!;
    // Fresh arrival starts its rise from t=0 again at this instant.
    expect(resurrected.riseFraction).toBe(0);
    expect(resurrected.laserFraction).toBe(0);
  });

  it("keeps a retiring item's last-known value (position/color) even though current no longer supplies one", () => {
    const tracker = createTransitionTracker<Point>();
    const current = new Map([["1,1", { x: 7, y: 9 }]]);
    diffTransitions(current, tracker, 0, { animateInitial: false });
    const empty = new Map<string, Point>();
    const retiring = diffTransitions(empty, tracker, 10).get("1,1")!;
    expect(retiring.x).toBe(7);
    expect(retiring.y).toBe(9);
  });

  it("refreshes an idle item's value in place every call (position/color can change without retriggering a transition)", () => {
    const tracker = createTransitionTracker<Point>();
    diffTransitions(new Map([["1,1", { x: 1, y: 1 }]]), tracker, 0, { animateInitial: false });
    const moved = diffTransitions(new Map([["1,1", { x: 5, y: 5 }]]), tracker, 10).get("1,1")!;
    expect(moved).toEqual({ x: 5, y: 5, riseFraction: 1, laserFraction: 1 });
  });

  it("handles multiple independent keys arriving and retiring in the same tick", () => {
    const tracker = createTransitionTracker<Point>();
    diffTransitions(new Map([["a", { x: 0, y: 0 }], ["b", { x: 1, y: 1 }]]), tracker, 0, { animateInitial: false });
    // "a" stays, "b" drops out, "c" is new.
    const out = diffTransitions(
      new Map([["a", { x: 0, y: 0 }], ["c", { x: 2, y: 2 }]]),
      tracker,
      0
    );
    expect(out.get("a")).toEqual({ x: 0, y: 0, riseFraction: 1, laserFraction: 1 });
    expect(out.get("b")?.laserFraction).toBe(1); // just started retiring
    expect(out.get("c")?.riseFraction).toBe(0); // just started arriving
  });

  describe("arriveStaggerMs", () => {
    it("with no stagger given, multiple new arrivals in the same call all start rising together (unchanged default)", () => {
      const tracker = createTransitionTracker<Point>();
      const current = new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 1, y: 0 }],
        ["c", { x: 2, y: 0 }]
      ]);
      diffTransitions(current, tracker, 0);
      const midRise = diffTransitions(current, tracker, ARRIVE_RISE_MS / 2);
      // All three are equally far into their rise -- no wave.
      expect(midRise.get("a")!.riseFraction).toBe(midRise.get("b")!.riseFraction);
      expect(midRise.get("b")!.riseFraction).toBe(midRise.get("c")!.riseFraction);
    });

    it("staggers a batch of new arrivals into a 1-2-3 wave, one item per arriveStaggerMs, in current's iteration order", () => {
      const tracker = createTransitionTracker<Point>();
      const current = new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 1, y: 0 }],
        ["c", { x: 2, y: 0 }]
      ]);
      const start = diffTransitions(current, tracker, 0, { arriveStaggerMs: STAGGER_MS });
      // Nothing has risen yet at t=0 -- "a" just began, "b"/"c" are still
      // waiting on their delay.
      expect(start.get("a")!.riseFraction).toBe(0);
      expect(start.get("b")!.riseFraction).toBe(0);
      expect(start.get("c")!.riseFraction).toBe(0);

      // Just after "a"'s own rise would be underway but before "b"'s delay
      // has elapsed: only "a" has actually started moving.
      const midway = diffTransitions(current, tracker, STAGGER_MS / 2, { arriveStaggerMs: STAGGER_MS });
      expect(midway.get("a")!.riseFraction).toBeGreaterThan(0);
      expect(midway.get("b")!.riseFraction).toBe(0); // still waiting out its stagger delay
      expect(midway.get("c")!.riseFraction).toBe(0);

      // Once "b"'s delay has elapsed, it's underway too, but "c" still waits.
      const secondWave = diffTransitions(current, tracker, STAGGER_MS + 1, { arriveStaggerMs: STAGGER_MS });
      expect(secondWave.get("b")!.riseFraction).toBeGreaterThan(0);
      expect(secondWave.get("c")!.riseFraction).toBe(0);

      // Once "c"'s delay has elapsed, all three are underway.
      const thirdWave = diffTransitions(current, tracker, 2 * STAGGER_MS + 1, { arriveStaggerMs: STAGGER_MS });
      expect(thirdWave.get("c")!.riseFraction).toBeGreaterThan(0);
    });

    it("does NOT stagger retiring items -- a batch that drops out together all start sinking on the same instant", () => {
      const tracker = createTransitionTracker<Point>();
      const current = new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 1, y: 0 }],
        ["c", { x: 2, y: 0 }]
      ]);
      diffTransitions(current, tracker, 0, { animateInitial: false });
      const empty = new Map<string, Point>();
      const out = diffTransitions(empty, tracker, 1000, { arriveStaggerMs: STAGGER_MS });
      // All three are equally far into their laser fade -- no wave on the way out.
      expect(out.get("a")!.laserFraction).toBe(out.get("b")!.laserFraction);
      expect(out.get("b")!.laserFraction).toBe(out.get("c")!.laserFraction);
    });

    it("staggers a resurrected (mid-retirement) arrival same as a brand-new one", () => {
      const tracker = createTransitionTracker<Point>();
      const current = new Map([
        ["a", { x: 0, y: 0 }],
        ["b", { x: 1, y: 0 }]
      ]);
      diffTransitions(current, tracker, 0, { animateInitial: false });
      const empty = new Map<string, Point>();
      diffTransitions(empty, tracker, 0); // both start retiring
      // Both reappear together, mid-retirement, staggered on resurrection too.
      const resurrected = diffTransitions(current, tracker, 10, { arriveStaggerMs: STAGGER_MS });
      expect(resurrected.get("a")!.riseFraction).toBe(0);
      expect(resurrected.get("b")!.riseFraction).toBe(0);
      // Partway through "a"'s stagger-adjusted rise, but before "b"'s delay
      // has elapsed: "a" is underway, "b" is still waiting.
      const between = diffTransitions(current, tracker, 10 + STAGGER_MS / 2, { arriveStaggerMs: STAGGER_MS });
      expect(between.get("a")!.riseFraction).toBeGreaterThan(0);
      expect(between.get("b")!.riseFraction).toBe(0);
    });
  });
});
