import { describe, expect, it } from "vitest";
import { battleClashMs } from "@border-empires/shared";
import { APPROACH_MS, computeBattlePose, computeSkirmishPose, MARINES_PER_SIDE, ROUT_MS, type BattleOverlayRenderEntry } from "./popup-marine-timeline.js";
import { comebackShots, dramaDeathMs, dramaHero, DRAMA_BOLT_MS, rankedMarines } from "./popup-marine-drama.js";
import { battleSiegeVictim, skirmishSiegeVictim } from "./popup-marine-siege-victim.js";
import { computeBattleBolts, computeBattleImpacts, computeSkirmishBolts } from "./popup-marine-bolts.js";
import { computeGarrisonPose, garrisonStartFor } from "./popup-marine-garrison.js";

const battle = (overrides: Partial<BattleOverlayRenderEntry> = {}): BattleOverlayRenderEntry => ({
  srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#f00", defenderColor: "#00f", attackerWon: true, hashSeed: 123,
  startAt: -APPROACH_MS, clashAt: 0, endAt: 4200 + ROUT_MS, fromSkirmish: true,
  presentation: "comeback", ...overrides
});
const pose = (b: BattleOverlayRenderEntry, side: 0 | 1, i: number, t: number) =>
  computeBattlePose(b, side, i, t, side === 0 ? -0.46 : 0.46, 0, 0, 1, side === 0 ? 1 : -1, 0);
const standing = (b: BattleOverlayRenderEntry, side: 0 | 1, t: number) =>
  Array.from({ length: MARINES_PER_SIDE }, (_, i) => pose(b, side, i, t)).filter((p) => p.scale > 0 && p.fallT === 0);

describe("resolution choreography", () => {
  it.each([true, false])("leaves one winning survivor before sequential comeback shots (attackerWon=%s)", (attackerWon) => {
    const b = battle({ attackerWon });
    const winner = attackerWon ? 0 : 1;
    const loser = attackerWon ? 1 : 0;
    expect(standing(b, winner, 1400)).toHaveLength(1);
    expect(standing(b, loser, 1400).length).toBeGreaterThan(1);
    const hero = dramaHero(b, winner);
    const shots = comebackShots(b, winner, hero)!;
    expect(shots).toHaveLength(6); // one opponent already fell in the skirmish
    for (const shot of shots) {
      const t = shot.atMs + DRAMA_BOLT_MS / 2;
      expect(computeBattleBolts(b, winner, hero, t)).toContainEqual({ progress: 0.5, targetIndex: shot.targetIndex });
      const hit = shot.atMs + DRAMA_BOLT_MS;
      expect(computeBattleImpacts(b, winner, hero, hit)).toContainEqual({ age: 0, targetIndex: shot.targetIndex });
      expect(pose(b, loser, shot.targetIndex, hit + 1).fallT).toBeGreaterThan(0);
    }
    expect(standing(b, loser, 4200)).toHaveLength(0);
    expect(standing(b, winner, 4200)).toHaveLength(1);
  });
  it("keeps skirmish casualties down from the first resolution frame", () => {
    const b = battle();
    for (const side of [0, 1] as const) {
      const casualty = rankedMarines(b.hashSeed, side)[0]!;
      expect(pose(b, side, casualty, 0).scale).toBe(0);
      expect(pose(b, side, casualty, 4200 + ROUT_MS - 1).scale).toBe(0);
    }
  });
  it("ends a failed last stand with no attackers still firing or retreating", () => {
    const b = battle({ presentation: "last-stand", attackerWon: false });
    expect(standing(b, 0, 1800)).toHaveLength(1);
    expect(standing(b, 0, 3000)).toHaveLength(0);
    expect(standing(b, 1, 2800).length).toBeGreaterThan(1);
  });
  it("holds a contested losing squad longer than a decisive one", () => {
    const decisive = battle({ presentation: "decisive", fromSkirmish: false });
    const contested = battle({ presentation: "contested", fromSkirmish: false });
    const victim = rankedMarines(decisive.hashSeed, 1)[1]!;
    expect(dramaDeathMs(decisive, 1, victim)).toBeLessThan(350);
    expect(dramaDeathMs(contested, 1, victim)).toBeGreaterThan(1100);
    expect(battleClashMs(contested.presentation)).toBeGreaterThan(battleClashMs(decisive.presentation));
  });
  it.each([true, false])("keeps exactly one winner running through the entire comeback ending (attackerWon=%s)", (attackerWon) => {
    const b = battle({ attackerWon });
    const winner = attackerWon ? 0 : 1;
    for (const elapsed of [1, 150, 300, 600, ROUT_MS]) {
      const survivors = standing(b, winner, 4200 + elapsed);
      expect(survivors).toHaveLength(1);
      expect(survivors[0]!.stance).toBe("run");
    }
  });
  it("never selects an absent hold-garrison member as the defending hero", () => {
    for (let seed = 0; seed < 100; seed++) {
      const b = battle({ hashSeed: seed, attackerWon: false, defenderGarrison: { fwdX: 1, fwdZ: 0 } });
      expect(dramaHero(b, 1)).not.toBe(rankedMarines(seed, 0)[0]);
    }
  });
});


it("keeps only the winning hero when returning to a held defender's formation", () => {
  const b = battle({ attackerWon: false, defenderGarrison: { fwdX: 0, fwdZ: 1 } });
  const hero = dramaHero(b, 1);
  for (let i = 0; i < MARINES_PER_SIDE; i++) {
    const end = computeBattlePose(b, 1, i, 4200 + ROUT_MS, 0.46, 0, 0, 1, -1, 0,
      undefined, garrisonStartFor(b.defenderGarrison, b.hashSeed, i));
    if (i !== hero) { expect(end.scale === 0 || end.fallT > 0).toBe(true); continue; }
    const hold = computeGarrisonPose({ tgtWorldX: 0, tgtWorldZ: 0, tgtSurfaceY: 0, color: "blue", fwdX: 0, fwdZ: 1, hashSeed: b.hashSeed, endsAt: 60000, survivorIndex: hero }, i, 4200 + ROUT_MS);
    expect(end.localX).toBeCloseTo(hold.localX);
    expect(end.localZ).toBeCloseTo(hold.localZ);
    expect(end.fallT).toBe(0);
  }
});


it("does not hide a soldier or skip a comeback shot for a late observer's unfinished skirmish", () => {
  const b = battle({ skirmishCasualties: false });
  expect(standing(b, 0, 0)).toHaveLength(7);
  expect(standing(b, 1, 0)).toHaveLength(7);
  expect(comebackShots(b, 0, dramaHero(b, 0))).toHaveLength(7);
});


it("keeps a lone held survivor alive through another skirmish and a winning defence", () => {
  const hero = rankedMarines(123, 1)[0]!; // would normally be the first casualty
  const facing = { fwdX: 0, fwdZ: 1, survivorIndex: hero };
  const b = battle({ attackerWon: false, presentation: "contested", defenderGarrison: facing });
  const start = garrisonStartFor(b.defenderGarrison, b.hashSeed, hero);
  const skirmish = computeSkirmishPose(b, 1, hero, 10000, 0.46, 0, 0, 1, -1, 0, undefined, start);
  expect(skirmish.scale).toBe(1); expect(skirmish.fallT).toBe(0);
  const won = computeBattlePose(b, 1, hero, 2100, 0.46, 0, 0, 1, -1, 0, undefined, start);
  expect(won.scale).toBe(1); expect(won.fallT).toBe(0);
  expect(comebackShots(battle({ defenderGarrison: facing }), 0, dramaHero(battle(), 0))).toHaveLength(1);
});


it("does not attribute a premature siege death to the sole surviving defender", () => {
  const b = battle({ attackerWon: false, fromSkirmish: false, defenderGarrison: { fwdX: 0, fwdZ: 1, survivorIndex: 3 } });
  expect(skirmishSiegeVictim(b)).toBeUndefined();
  expect(battleSiegeVictim(b)).toBeUndefined();
  expect(battleSiegeVictim({ ...b, attackerWon: true })).toMatchObject({ index: 3 });
});


it("aims attacks at the surviving garrison soldier rather than its absent squad members", () => {
  const b = battle({ presentation: "contested", defenderGarrison: { fwdX: 0, fwdZ: 1, survivorIndex: 3 } });
  const shots = Array.from({ length: 20 }, (_, n) => 100 * n).flatMap((t) => [
    ...computeBattleBolts(b, 0, 2, t), ...computeSkirmishBolts(b, 0, 2, t)
  ]);
  expect(shots.length).toBeGreaterThan(0);
  expect(shots.every((shot) => shot.targetIndex === 3)).toBe(true);
});
