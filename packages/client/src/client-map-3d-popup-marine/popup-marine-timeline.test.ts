import { describe, expect, it } from "vitest";
import {
  APPROACH_MS,
  CLASH_MS,
  LINEUP_MS,
  MARCH_MS,
  MARINES_PER_SIDE,
  MARINE_SPACING,
  ROUT_MS,
  WINNER_DEATHS,
  LOSER_DEATHS,
  computeBattlePose,
  computeSkirmishPose,
  deathKitFor,
  dyingIndicesFor,
  marineKitFor,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry
} from "./popup-marine-timeline.js";

// Roughly the baked model's shoulder-pad span (see
// bake-popup-marine-model.mjs) — kept in sync here so this test actually
// catches a spacing regression that would fuse marines together, not just a
// change to MARINE_SPACING in isolation.
const MARINE_FOOTPRINT_WIDTH = 0.028;

const AXES = { perpX: 1, perpZ: 0, fwdX: 0, fwdZ: 1 };

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
  hashSeed: 42,
  ...overrides
});

const skirmish = (overrides: Partial<BattleOverlaySkirmishEntry> = {}): BattleOverlaySkirmishEntry => ({
  srcWorldX: -1, srcWorldZ: 0,
  tgtWorldX: 1, tgtWorldZ: 0,
  srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#4fb3ff", defenderColor: "#ff5d5d",
  startAt: 0,
  hashSeed: 42,
  ...overrides
});

describe("popup-marine-timeline: squad size and casualty counts", () => {
  it("keeps a small squad (3-5 marines per side) as requested", () => {
    expect(MARINES_PER_SIDE).toBeGreaterThanOrEqual(3);
    expect(MARINES_PER_SIDE).toBeLessThanOrEqual(5);
  });

  it("never wipes a side to zero — always leaves survivors for rout to push through or scatter", () => {
    expect(WINNER_DEATHS).toBeLessThan(MARINES_PER_SIDE);
    expect(LOSER_DEATHS).toBeLessThan(MARINES_PER_SIDE);
  });

  it("spaces adjacent firing-line slots wider than the model's footprint, so marines never visually fuse", () => {
    // Regression test for the "solid fused blob" bug: MARINE_SPACING must
    // stay comfortably larger than MARINE_FOOTPRINT_WIDTH, and every pair of
    // marines' perpPos slots (for a range of seeds, to cover jitter) must
    // end up separated by at least the footprint width.
    for (let seed = 0; seed < 8; seed++) {
      const positions = Array.from({ length: MARINES_PER_SIDE }, (_, i) => marineKitFor(seed, 0, i).perpPos).sort(
        (a, b) => a - b
      );
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]! - positions[i - 1]!).toBeGreaterThanOrEqual(MARINE_FOOTPRINT_WIDTH);
      }
    }
    expect(MARINE_SPACING).toBeGreaterThan(MARINE_FOOTPRINT_WIDTH);
  });

  it("dyingIndicesFor always returns exactly N indices, biased toward the losing side", () => {
    const b = battle();
    const winningSide = dyingIndicesFor((s, i) => deathKitFor(b.hashSeed, s, i), 0, true);
    const losingSide = dyingIndicesFor((s, i) => deathKitFor(b.hashSeed, s, i), 1, false);
    expect(winningSide.size).toBe(WINNER_DEATHS);
    expect(losingSide.size).toBe(LOSER_DEATHS);
  });
});

describe("popup-marine-timeline: resolved-battle pose phases", () => {
  it("starts marines popping in near their side's cover position (t=0)", () => {
    const b = battle();
    const pose = computeBattlePose(b, 0, 0, 0, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeLessThan(0.2);
    expect(pose.crouchT).toBe(0);
  });

  it("reaches full scale by the end of lineup", () => {
    const b = battle();
    const pose = computeBattlePose(b, 0, 0, LINEUP_MS - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeCloseTo(1, 1);
  });

  it("advances from cover toward the firing line during march", () => {
    const b = battle();
    const early = computeBattlePose(b, 0, 0, LINEUP_MS + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    const late = computeBattlePose(b, 0, 0, APPROACH_MS - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    // Moving from -0.4 (cover, local X) toward the firing line (near 0) — late
    // sample should be closer to the firing line than the early sample.
    expect(Math.abs(late.localX)).toBeLessThan(Math.abs(early.localX));
  });

  it("pops up out of cover (higher crouchT) around a marine's own fire pulses during the firefight", () => {
    const b = battle();
    const samples = Array.from({ length: 40 }, (_, i) =>
      computeBattlePose(b, 0, 1, APPROACH_MS + (i / 40) * CLASH_MS, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ)
    );
    expect(samples.some((p) => p.crouchT > 0.8)).toBe(true);
    expect(samples.some((p) => p.crouchT < 0.2)).toBe(true);
  });

  it("fires a muzzle flash only during brief windows, not continuously", () => {
    const b = battle();
    const samples = Array.from({ length: 60 }, (_, i) =>
      computeBattlePose(b, 0, 1, APPROACH_MS + (i / 60) * CLASH_MS, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ)
    );
    const flashing = samples.filter((p) => p.flash > 0).length;
    expect(flashing).toBeGreaterThan(0);
    expect(flashing).toBeLessThan(samples.length);
  });

  it("collapses a dying marine (fallT -> 1) during the firefight window it dies in", () => {
    const b = battle({ attackerWon: false }); // side 0 (attacker) is losing -> LOSER_DEATHS
    let sawFall = false;
    for (let i = 0; i < MARINES_PER_SIDE; i++) {
      const dying = dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), 0, false).has(i);
      if (!dying) continue;
      const pose = computeBattlePose(b, 0, i, b.clashAt + CLASH_MS - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
      expect(pose.fallT).toBeGreaterThan(0);
      sawFall = true;
    }
    expect(sawFall).toBe(true);
  });

  it("keeps a dead marine collapsed (not resurrected) into the rout phase", () => {
    const b = battle({ attackerWon: false });
    const deadIndex = [...dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), 0, false)][0]!;
    const pose = computeBattlePose(b, 0, deadIndex, b.endAt - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.fallT).toBe(1);
  });

  it("pushes a surviving winner forward during rout", () => {
    const b = battle({ attackerWon: true });
    const survivor = Array.from({ length: MARINES_PER_SIDE }, (_, i) => i).find(
      (i) => !dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), 0, true).has(i)
    )!;
    const pose = computeBattlePose(b, 0, survivor, b.endAt - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    // fwd axis here is (0,1) in Z; the winner should have advanced along +Z.
    expect(pose.localZ).toBeGreaterThan(0);
  });

  it("scatters a surviving loser away from the firing line during rout", () => {
    const b = battle({ attackerWon: false });
    const survivor = Array.from({ length: MARINES_PER_SIDE }, (_, i) => i).find(
      (i) => !dyingIndicesFor((s, j) => deathKitFor(b.hashSeed, s, j), 0, false).has(i)
    )!;
    const pose = computeBattlePose(b, 0, survivor, b.endAt - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeLessThan(1);
  });
});

describe("popup-marine-timeline: skirmish continuity", () => {
  it("keeps identical positioning to a resolved battle with the same hashSeed/startAt through cover+advance", () => {
    const startAt = 1000;
    const s = skirmish({ startAt });
    const b = battle({ startAt, clashAt: startAt + APPROACH_MS, hashSeed: s.hashSeed });
    const t = startAt + LINEUP_MS + 100;
    const sPose = computeSkirmishPose(s, 0, 2, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    const bPose = computeBattlePose(b, 0, 2, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(sPose.localX).toBeCloseTo(bPose.localX, 10);
    expect(sPose.localZ).toBeCloseTo(bPose.localZ, 10);
  });

  it("loops the firefight indefinitely with no rout phase", () => {
    const s = skirmish();
    const pose = computeSkirmishPose(s, 0, 0, APPROACH_MS + CLASH_MS * 5.5, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeGreaterThan(0);
  });

  it("sheds WINNER_DEATHS-equivalent casualties on its own first firefight cycle", () => {
    const s = skirmish();
    let sawFall = false;
    for (let i = 0; i < MARINES_PER_SIDE; i++) {
      const dying = dyingIndicesFor((side, j) => deathKitFor(s.hashSeed, side, j), 0, true).has(i);
      if (!dying) continue;
      const dKit = deathKitFor(s.hashSeed, 0, i);
      const t = APPROACH_MS + dKit.at * CLASH_MS + 50;
      const pose = computeSkirmishPose(s, 0, i, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
      expect(pose.fallT).toBeGreaterThan(0);
      sawFall = true;
    }
    expect(sawFall).toBe(true);
  });
});

// The old dot-swarm system exported these same constants (LINEUP_MS,
// MARCH_MS, APPROACH_MS, CLASH_MS, ROUT_MS) and client-battle-overlay.ts's
// registerActiveBattleFromTileDelta depends on APPROACH_MS/CLASH_MS/ROUT_MS
// to compute startAt/clashAt/endAt — this is renderer-agnostic game timing,
// not just old FX, so the new module must keep exporting them.
describe("popup-marine-timeline: exported timing surface", () => {
  it("still exposes the timeline constants client-battle-overlay.ts depends on", () => {
    expect(LINEUP_MS).toBeGreaterThan(0);
    expect(MARCH_MS).toBeGreaterThan(0);
    expect(APPROACH_MS).toBe(LINEUP_MS + MARCH_MS);
    expect(CLASH_MS).toBeGreaterThan(0);
    expect(ROUT_MS).toBeGreaterThan(0);
  });
});
