import { describe, expect, it } from "vitest";
import { CLASH_MS, computeBattlePose, computeSkirmishPose, type BattleOverlayRenderEntry, type BattleOverlaySkirmishEntry } from "./popup-marine-timeline.js";
import { battleChoreographyFor, choreographyApproachMs, choreographyMarineKitFor, type BattleChoreography } from "./popup-marine-choreography.js";
import { skirmishCasualtyMasksAt, scriptedSkirmishShots } from "./popup-marine-full-casualties.js";
import { computeBattleBolts, computeSkirmishBolts, computeSkirmishImpacts } from "./popup-marine-bolts.js";
import { dramaHero, rankedMarines, DRAMA_BOLT_MS } from "./popup-marine-drama.js";

const patterns: readonly BattleChoreography[] = ["assault", "crossfire", "holdout", "counterpush"];
const skirmish = (choreography: BattleChoreography): BattleOverlaySkirmishEntry => ({
  srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "red", defenderColor: "blue", hashSeed: 123, startAt: 0, choreography
});
const pose = (b: BattleOverlaySkirmishEntry, side: 0 | 1, i: number, t: number) =>
  computeSkirmishPose(b, side, i, t, side === 0 ? -0.46 : 0.46, 0, 0, 1, side === 0 ? 1 : -1, 0);
const alive = (b: BattleOverlaySkirmishEntry, side: 0 | 1, t: number) =>
  Array.from({ length: 7 }, (_, i) => pose(b, side, i, t)).filter((p) => p.scale > 0 && p.fallT === 0);

const resolved = (b: BattleOverlaySkirmishEntry, attackerWon = true): BattleOverlayRenderEntry => ({
  ...b, startAt: 11600, choreographyStartAt: 0, clashAt: 15000, endAt: attackerWon ? 20150 : 18750,
  attackerWon, presentation: attackerWon ? "comeback" : "last-stand", fromSkirmish: true,
  fallenBeforeResolution: skirmishCasualtyMasksAt(b, 15000)
});

describe("straight approaches and planted firing positions", () => {
  it.each(patterns)("runs directly into position without waving for %s", (pattern) => {
    const b = skirmish(pattern);
    for (let i = 0; i < 7; i++) {
      const frames = [200, 500, 800, 1100, 1500].map((t) => pose(b, 0, i, t));
      for (let j = 1; j < frames.length; j++) {
        expect(frames[j]!.localX).toBeGreaterThanOrEqual(frames[j - 1]!.localX);
        expect(frames[j]!.localZ).toBeCloseTo(frames[0]!.localZ, 12);
      }
    }
    expect(alive(b, 0, 1000)).toHaveLength(7);
  });
  it.each(patterns)("holds its firing positions after arrival/backstep for %s", (pattern) => {
    const b = skirmish(pattern);
    for (let i = 0; i < 7; i++) for (const side of [0, 1] as const) {
      const at = pose(b, side, i, 3500);
      for (const t of [5000, 7000, 9000, 14000]) {
        const later = pose(b, side, i, t);
        expect(later.localX).toBe(at.localX); expect(later.localZ).toBe(at.localZ);
        expect(later.stance).not.toBe("run"); expect(later.stance).not.toBe("walkBack");
      }
    }
  });
  it("uses one slow backward walking step rather than running in reverse", () => {
    const b = skirmish("counterpush"); const hero = rankedMarines(b.hashSeed, 0)[6]!;
    expect(pose(b, 0, hero, 2400).stance).toBe("walkBack");
    expect(pose(b, 0, hero, 2400).localX).toBeLessThan(pose(b, 0, hero, 1900).localX);
    expect(pose(b, 0, hero, 3500).localX).toBe(pose(b, 0, hero, 9000).localX);
    expect(pose(b, 0, hero, 3500).stance).not.toBe("walkBack");
  });
});

describe("mid-battle lone-survivor staging", () => {
  it.each(["holdout", "counterpush"] as const)("has six yellow soldiers fully down by halfway in %s", (pattern) => {
    const b = skirmish(pattern);
    expect(alive(b, 0, 1500)).toHaveLength(7);
    expect(alive(b, 0, 7500)).toHaveLength(1);
    expect(Array.from({ length: 7 }, (_, i) => pose(b, 0, i, 7500)).filter((p) => p.fallT === 1)).toHaveLength(6);
    expect(alive(b, 0, 14999)).toHaveLength(1);
  });
  it("keeps the failed last stand's opponents intact while the lone yellow soldier holds out", () => {
    const b = skirmish("holdout");
    expect(alive(b, 1, 7500)).toHaveLength(6);
    expect(alive(b, 1, 14999)).toHaveLength(6);
    const end = resolved(b, false); const hero = rankedMarines(b.hashSeed, 0)[6]!;
    expect(computeBattlePose(end, 0, hero, 18000, -0.46, 0, 0, 1, 1, 0).fallT).toBeGreaterThan(0);
  });
  it("picks off blue soldiers one by one after halfway, reserving the final opponent for resolution", () => {
    const b = skirmish("counterpush");
    expect([7500, 9300, 10800, 12200, 13700, 14900].map((t) => alive(b, 1, t).length)).toEqual([6, 5, 4, 3, 2, 1]);
    const hero = rankedMarines(b.hashSeed, 0)[6]!;
    const shots = scriptedSkirmishShots(b, 0, hero, 8000)!;
    expect(shots).toHaveLength(5);
    for (const shot of shots) {
      expect(pose(b, 0, hero, shot.at).flash).toBeCloseTo(1);
      expect(computeSkirmishBolts(b, 0, hero, shot.at + 60)).toContainEqual({ progress: 0.5, targetIndex: shot.targetIndex });
      const hit = shot.at + DRAMA_BOLT_MS;
      expect(computeSkirmishImpacts(b, 0, hero, hit)).toContainEqual({ age: 0, targetIndex: shot.targetIndex });
      expect(pose(b, 1, shot.targetIndex, hit + 1).fallT).toBeGreaterThan(0);
    }
  });
  it.each([true, false])("never resurrects the fallen squad when the actual result arrives (%s)", (attackerWon) => {
    const b = skirmish("counterpush"); const end = resolved(b, attackerWon);
    for (const side of [0, 1] as const) {
      const mask = end.fallenBeforeResolution![side === 0 ? "attacker" : "defender"];
      for (let i = 0; i < 7; i++) if (mask & (1 << i)) {
        expect(computeBattlePose(end, side, i, 15000, side === 0 ? -0.46 : 0.46, 0, 0, 1, side === 0 ? 1 : -1, 0).scale).toBe(0);
      }
    }
    const winner = attackerWon ? 0 : 1;
    const late = Array.from({ length: 7 }, (_, i) => computeBattlePose(end, winner, i, end.endAt - 1,
      winner === 0 ? -0.46 : 0.46, 0, 0, 1, winner === 0 ? 1 : -1, 0));
    expect(late.filter((p) => p.scale > 0 && p.fallT === 0)).toHaveLength(1);
    if (attackerWon) {
      const hero = dramaHero(end, 0); const blue = rankedMarines(b.hashSeed, 1)[6]!;
      const bolts = Array.from({ length: 42 }, (_, j) => j * 100).flatMap((t) => computeBattleBolts(end, 0, hero, 15000 + t));
      expect(bolts.length).toBeGreaterThan(0); expect(bolts.every((bolt) => bolt.targetIndex === blue)).toBe(true);
    }
  });
});

it("keeps four distinct firing rhythms with flashes and bolts on the same clock", () => {
  expect(new Set(patterns.map((p) => choreographyMarineKitFor(skirmish(p), 0, 6).fireAt.join(","))).size).toBe(4);
  for (const pattern of patterns) {
    const b = skirmish(pattern); const hero = rankedMarines(b.hashSeed, 0)[6]!;
    const at = choreographyApproachMs(b) + choreographyMarineKitFor(b, 0, hero).fireAt[0] * CLASH_MS;
    expect(pose(b, 0, hero, at).flash).toBeCloseTo(1, 4);
    expect(computeSkirmishBolts(b, 0, hero, at + 1).length).toBeGreaterThan(0);
  }
});

it("selects neutral staging without an outcome or strength field", () => {
  expect(new Set([0, 1, 2, 3].map(battleChoreographyFor)).size).toBe(4);
});


describe("visibly distinct assault and contested exchanges", () => {
  it("drops four defenders early in the assault while six attackers hold", () => {
    const b = skirmish("assault");
    expect(alive(b, 0, 1000)).toHaveLength(7);
    expect(alive(b, 1, 1000)).toHaveLength(7);
    expect(alive(b, 0, 7500)).toHaveLength(6);
    expect(alive(b, 1, 7500)).toHaveLength(3);
    expect(alive(b, 1, 14999)).toHaveLength(3);
  });
  it("spreads contested losses across both sides over the full exchange", () => {
    const b = skirmish("crossfire");
    for (const side of [0, 1] as const) {
      expect([3000, 7500, 14000].map((t) => alive(b, side, t).length)).toEqual([7, 5, 4]);
    }
  });
  it("uses an upright assault line against crouched defenders, versus mixed contested poses", () => {
    const assault = skirmish("assault");
    for (let i = 0; i < 7; i++) {
      expect(pose(assault, 0, i, 1500).stance).toBe("stand");
      expect(pose(assault, 1, i, 1500).stance).toBe("kneel");
    }
    for (const side of [0, 1] as const) {
      const stances = new Set(Array.from({ length: 7 }, (_, i) => pose(skirmish("crossfire"), side, i, 1500).stance));
      expect(stances).toEqual(new Set(["stand", "kneel"]));
    }
  });
});
