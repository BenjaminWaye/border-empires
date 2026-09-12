// Coverage for the shot lifecycle in popup-marine-bolts.ts: a fire pulse ->
// a bolt crossing to its target -> the spark burst where it lands. All of it
// is a pure function of the firefight clock, which is the property most of
// these cases exist to pin: the overlay scrubs its timeline, so a shot must
// look identical every time the same instant is rendered.
import { describe, expect, it } from "vitest";
import {
  BOLT_TRAVEL_T,
  SPARKS_PER_IMPACT,
  SPARK_LINGER_T,
  computeBattleBolts,
  computeBattleImpacts,
  computeSkirmishBolts,
  computeSkirmishImpacts,
  sparkShard
} from "./popup-marine-bolts.js";
import { APPROACH_MS, CLASH_MS, MARINES_PER_SIDE, ROUT_MS, marineKitFor } from "./popup-marine-timeline.js";
import type { BattleOverlayRenderEntry, BattleOverlaySkirmishEntry } from "./popup-marine-timeline.js";

const battle = (overrides: Partial<BattleOverlayRenderEntry> = {}): BattleOverlayRenderEntry => ({
  srcWorldX: -1, srcWorldZ: 0,
  tgtWorldX: 1, tgtWorldZ: 0,
  srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
  attackerWon: true,
  startAt: 0,
  clashAt: APPROACH_MS,
  endAt: APPROACH_MS + CLASH_MS + ROUT_MS,
  fromSkirmish: false,
  hashSeed: 7,
  ...overrides
});

const skirmish = (): BattleOverlaySkirmishEntry => ({
  srcWorldX: -1, srcWorldZ: 0,
  tgtWorldX: 1, tgtWorldZ: 0,
  srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
  startAt: 0,
  hashSeed: 42
});

describe("popup-marine-timeline: laser bolts", () => {
  it("launches a bolt from each of a marine's own fire pulses", () => {
    const b = battle();
    const kit = marineKitFor(b.hashSeed, 0, 1);
    for (const firedAt of kit.fireAt) {
      // Just after the pulse: a bolt has left the muzzle.
      const justAfter = computeBattleBolts(b, 0, 1, b.clashAt + (firedAt + 0.01) * CLASH_MS);
      expect(justAfter.length).toBeGreaterThan(0);
      expect(justAfter[0]!.progress).toBeGreaterThan(0);
    }
  });

  it("keeps a bolt in flight only for its travel window, with progress running 0 -> 1", () => {
    const b = battle();
    const firedAt = marineKitFor(b.hashSeed, 0, 1).fireAt[0]!;
    const at = (t: number): number => b.clashAt + t * CLASH_MS;

    expect(computeBattleBolts(b, 0, 1, at(firedAt - 0.01))).toHaveLength(0);
    const early = computeBattleBolts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T * 0.25));
    const late = computeBattleBolts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T * 0.9));
    expect(early[0]!.progress).toBeLessThan(late[0]!.progress);
    expect(late[0]!.progress).toBeLessThanOrEqual(1);
    // Past the travel window that bolt has landed and is gone.
    expect(computeBattleBolts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T * 1.5))).toHaveLength(0);
  });

  it("aims every bolt at a real opposing-marine index", () => {
    const b = battle();
    for (let side = 0 as 0 | 1; side < 2; side++) {
      for (let i = 0; i < MARINES_PER_SIDE; i++) {
        for (const firedAt of marineKitFor(b.hashSeed, side, i).fireAt) {
          for (const bolt of computeBattleBolts(b, side, i, b.clashAt + (firedAt + 0.01) * CLASH_MS)) {
            expect(bolt.targetIndex).toBeGreaterThanOrEqual(0);
            expect(bolt.targetIndex).toBeLessThan(MARINES_PER_SIDE);
          }
        }
      }
    }
  });

  it("is a pure function of time — the same instant always yields the same bolts", () => {
    const b = battle();
    const t = b.clashAt + 0.3 * CLASH_MS;
    expect(computeBattleBolts(b, 0, 2, t)).toEqual(computeBattleBolts(b, 0, 2, t));
  });

  it("fires no bolts outside the firefight window", () => {
    const b = battle();
    expect(computeBattleBolts(b, 0, 0, b.startAt)).toHaveLength(0); // lineup
    expect(computeBattleBolts(b, 0, 0, b.clashAt - 1)).toHaveLength(0); // still marching
    expect(computeBattleBolts(b, 0, 0, b.clashAt + CLASH_MS + 1)).toHaveLength(0); // routing
  });

  it("keeps firing across the skirmish's looping firefight", () => {
    const s = skirmish();
    const firedAt = marineKitFor(s.hashSeed, 0, 1).fireAt[0]!;
    const firstCycle = computeSkirmishBolts(s, 0, 1, APPROACH_MS + (firedAt + 0.01) * CLASH_MS);
    const laterCycle = computeSkirmishBolts(s, 0, 1, APPROACH_MS + CLASH_MS * 3 + (firedAt + 0.01) * CLASH_MS);
    expect(firstCycle.length).toBeGreaterThan(0);
    expect(laterCycle).toEqual(firstCycle);
    // ...but not before the squad has reached the firing line.
    expect(computeSkirmishBolts(s, 0, 1, APPROACH_MS - 1)).toHaveLength(0);
  });
});

describe("popup-marine-bolts: impact sparks", () => {
  const b = battle();
  const firedAt = marineKitFor(b.hashSeed, 0, 1).fireAt[0]!;
  const at = (t: number): number => b.clashAt + t * CLASH_MS;

  it("sparks only after the bolt has landed, never while it is still crossing", () => {
    // Mid-flight: the round is in the air, so nothing has been struck yet.
    expect(computeBattleImpacts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T * 0.5))).toHaveLength(0);
    // Just past arrival: sparks.
    expect(computeBattleImpacts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T + SPARK_LINGER_T * 0.1)).length)
      .toBeGreaterThan(0);
    // Long after: the burst has finished fading.
    expect(computeBattleImpacts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T + SPARK_LINGER_T * 1.5))).toHaveLength(0);
  });

  it("hands the burst off from the bolt with no gap and no overlap", () => {
    // Regression guard for the seam: if these windows drifted apart the
    // streak would vanish for a frame before its sparks appeared (or the
    // two would double up), which reads as a flicker at the point of impact.
    const seam = at(firedAt + BOLT_TRAVEL_T);
    expect(computeBattleBolts(b, 0, 1, seam - 1).length).toBeGreaterThan(0);
    expect(computeBattleImpacts(b, 0, 1, seam - 1)).toHaveLength(0);
    expect(computeBattleBolts(b, 0, 1, seam + 1)).toHaveLength(0);
    expect(computeBattleImpacts(b, 0, 1, seam + 1).length).toBeGreaterThan(0);
  });

  it("sparks on the same marine the bolt was aimed at", () => {
    const bolt = computeBattleBolts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T * 0.5))[0]!;
    const impact = computeBattleImpacts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T + SPARK_LINGER_T * 0.1))[0]!;
    expect(impact.targetIndex).toBe(bolt.targetIndex);
    expect(impact.targetIndex).toBeLessThan(MARINES_PER_SIDE);
  });

  it("fades a burst out over its lifetime", () => {
    const ageAt = (t: number): number => computeBattleImpacts(b, 0, 1, at(firedAt + BOLT_TRAVEL_T + t))[0]!.age;
    const young = ageAt(SPARK_LINGER_T * 0.1);
    const old = ageAt(SPARK_LINGER_T * 0.9);
    expect(young).toBeLessThan(old);
    // brightness is the inverse: a shard dims as its impact ages.
    const shardAt = (age: number) => sparkShard(b.hashSeed, 0, 1, { targetIndex: 2, age }, 0);
    expect(shardAt(0.1).brightness).toBeGreaterThan(shardAt(0.9).brightness);
  });

  it("throws its shards apart, and further apart as the burst blooms", () => {
    const spreadAt = (age: number): number => {
      const s = sparkShard(b.hashSeed, 0, 1, { targetIndex: 2, age }, 0);
      return Math.hypot(s.x, s.y, s.z);
    };
    expect(spreadAt(0.05)).toBeLessThan(spreadAt(0.6));
    // Shards of one burst don't all fly the same way, or it reads as one dot.
    const dirs = new Set(
      Array.from({ length: SPARKS_PER_IMPACT }, (_, shard) => {
        const s = sparkShard(b.hashSeed, 0, 1, { targetIndex: 2, age: 0.5 }, shard);
        return `${s.x.toFixed(3)},${s.z.toFixed(3)}`;
      })
    );
    expect(dirs.size).toBe(SPARKS_PER_IMPACT);
  });

  it("is a pure function of time — the same instant always yields the same sparks", () => {
    const t = at(firedAt + BOLT_TRAVEL_T + SPARK_LINGER_T * 0.4);
    expect(computeBattleImpacts(b, 0, 1, t)).toEqual(computeBattleImpacts(b, 0, 1, t));
    expect(sparkShard(b.hashSeed, 0, 1, { targetIndex: 2, age: 0.3 }, 4))
      .toEqual(sparkShard(b.hashSeed, 0, 1, { targetIndex: 2, age: 0.3 }, 4));
  });

  it("sparks across the skirmish's looping firefight, but not before contact", () => {
    const s = skirmish();
    const sFiredAt = marineKitFor(s.hashSeed, 0, 1).fireAt[0]!;
    const hitT = (sFiredAt + BOLT_TRAVEL_T + SPARK_LINGER_T * 0.2) * CLASH_MS;
    const first = computeSkirmishImpacts(s, 0, 1, APPROACH_MS + hitT);
    expect(first.length).toBeGreaterThan(0);
    // Same burst, same target, same point in its fade — modulo the float
    // noise of taking the elapsed time modulo three whole cycles.
    const later = computeSkirmishImpacts(s, 0, 1, APPROACH_MS + CLASH_MS * 3 + hitT);
    expect(later).toHaveLength(first.length);
    expect(later[0]!.targetIndex).toBe(first[0]!.targetIndex);
    expect(later[0]!.age).toBeCloseTo(first[0]!.age, 6);
    expect(computeSkirmishImpacts(s, 0, 1, APPROACH_MS - 1)).toHaveLength(0);
  });
});
