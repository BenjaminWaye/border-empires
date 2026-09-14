import { describe, expect, it } from "vitest";
import {
  APPROACH_MS,
  CLASH_MS,
  LINEUP_MS,
  MARCH_MS,
  MARINES_PER_SIDE,
  MARINE_MODEL_SCALE,
  MARINE_SPACING,
  ROUT_MS,
  clampLocal,
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

// Roughly the baked model's shoulder-pad span at its native (unscaled) size
// (see bake-popup-marine-model.mjs), scaled up by MARINE_MODEL_SCALE to
// match the rendered model's actual on-screen footprint — kept in sync here
// so this test actually catches a spacing regression that would fuse
// marines together, not just a change to MARINE_SPACING in isolation.
const MARINE_FOOTPRINT_WIDTH = 0.028 * MARINE_MODEL_SCALE;

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
  it("keeps a small squad (6-a-side, as requested) rather than a crowd", () => {
    expect(MARINES_PER_SIDE).toBeGreaterThanOrEqual(3);
    expect(MARINES_PER_SIDE).toBeLessThanOrEqual(8);
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
  it("starts marines popping in near their side's cover position (t=0), already standing/aiming", () => {
    const b = battle();
    const pose = computeBattlePose(b, 0, 0, 0, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeLessThan(0.2);
    expect(pose.crouchT).toBe(1);
  });

  it("reaches full scale by the end of lineup", () => {
    const b = battle();
    const pose = computeBattlePose(b, 0, 0, LINEUP_MS - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(pose.scale).toBeCloseTo(1, 1);
  });

  it("advances from cover toward its own halt point during march", () => {
    const b = battle();
    const at = (t: number) => computeBattlePose(b, 0, 0, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    // Each marine now halts at its OWN spot (its formation slot plus its own
    // stop depth), not on a shared line near local origin, so the invariant
    // is "gets closer to where it ends up", not "gets closer to zero".
    const firing = computeBattlePose(b, 0, 0, b.clashAt + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    const distTo = (p: { localX: number; localZ: number }): number =>
      Math.hypot(p.localX - firing.localX, p.localZ - firing.localZ);
    expect(distTo(at(APPROACH_MS - 1))).toBeLessThan(distTo(at(LINEUP_MS + 1)));
  });

  it("staggers the squad in depth and spaces it out, rather than dressing one line", () => {
    const b = battle();
    const firing = Array.from({ length: MARINES_PER_SIDE }, (_, i) =>
      computeBattlePose(b, 0, i, b.clashAt + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ)
    );
    // fwd axis is Z here, so differing localZ means differing halt distances.
    const depths = new Set(firing.map((p) => p.localZ.toFixed(4)));
    expect(depths.size).toBeGreaterThan(1);
    // Neighbouring slots must stay at least a model-width apart.
    const acrossLine = firing.map((p) => p.localX).sort((a, b2) => a - b2);
    for (let i = 1; i < acrossLine.length; i++) {
      expect(acrossLine[i]! - acrossLine[i - 1]!).toBeGreaterThan(MARINE_FOOTPRINT_WIDTH);
    }
  });

  it("keeps every firing-line marine spread out AFTER the render clamp, not just before it", () => {
    // Regression: popup-marine-overlay-fx.ts's writeMarine renders
    // tileX + clampLocal(pose.localX), not the raw pose.localX every other
    // test in this file reads. MARINE_SPACING used to be a value fixed for
    // the original 4-marine squad; widening the squad (6, then 7) pushed
    // the outermost marines' raw perpPos past clampLocal's bound WITHOUT
    // any raw-position test noticing, so the actual on-screen result was
    // several marines at each end of the line collapsing onto the same
    // clamped edge value -- reading as marines "standing on each other" and
    // a line that looked shorter than the squad actually was. Every
    // assertion here is on the CLAMPED position, matching what a player
    // sees.
    const b = battle();
    const firing = Array.from({ length: MARINES_PER_SIDE }, (_, i) =>
      computeBattlePose(b, 0, i, b.clashAt + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ)
    );
    const acrossLine = firing.map((p) => clampLocal(p.localX)).sort((a, b2) => a - b2);
    for (let i = 1; i < acrossLine.length; i++) {
      expect(acrossLine[i]! - acrossLine[i - 1]!).toBeGreaterThan(MARINE_FOOTPRINT_WIDTH);
    }
    const depths = new Set(firing.map((p) => clampLocal(p.localZ).toFixed(4)));
    expect(depths.size).toBeGreaterThan(1);
  });

  it("runs while advancing, then holds a standing or kneeling firing stance", () => {
    const b = battle();
    const midMarch = (LINEUP_MS + b.clashAt) / 2;
    const marching = Array.from({ length: MARINES_PER_SIDE }, (_, i) =>
      computeBattlePose(b, 0, i, midMarch, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ).stance
    );
    expect(marching).toContain("run");

    const stances = new Set(
      Array.from({ length: MARINES_PER_SIDE }, (_, i) =>
        computeBattlePose(b, 0, i, b.clashAt + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ).stance
      )
    );
    for (const stance of stances) expect(["stand", "kneel"]).toContain(stance);
    // A marine's stance is stable for the whole firefight, never flickering
    // between standing and kneeling frame to frame.
    const early = computeBattlePose(b, 0, 0, b.clashAt + 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    const late = computeBattlePose(b, 0, 0, b.clashAt + CLASH_MS - 1, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
    expect(late.stance).toBe(early.stance);
  });

  it("holds every marine completely still until its own advance begins", () => {
    // Regression: the lineup phase added a per-marine sine sway to the
    // formation slot. The battle camera views the tile obliquely, so that
    // sideways drift read as the squad hovering up and down before the
    // fight started. Marines wait motionless, then run.
    const b = battle();
    for (let i = 0; i < MARINES_PER_SIDE; i++) {
      const at = (t: number) =>
        computeBattlePose(b, 0, i, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
      const first = at(b.startAt + 1);
      for (let t = b.startAt + 1; t < b.startAt + LINEUP_MS; t += 40) {
        const pose = at(t);
        expect(pose.localX).toBeCloseTo(first.localX, 10);
        expect(pose.localZ).toBeCloseTo(first.localZ, 10);
        // ...and waits in a firing stance rather than running on the spot.
        expect(["stand", "kneel"]).toContain(pose.stance);
      }
    }
  });

  it("runs straight out of the waiting slot, never teleporting into a pile first", () => {
    // Regression: the lineup phase stood each marine in its own slot along
    // the firing line (entry + perp * perpPos), but the advance lerped from
    // the bare entry point. So the instant lineup ended every marine
    // snapped sideways onto the SAME spot — the squad visibly collapsed
    // into a pile and then fanned back out as it advanced.
    const b = battle();
    const STEP = 16;
    const lineupEnd = b.startAt + LINEUP_MS;
    for (let i = 0; i < MARINES_PER_SIDE; i++) {
      const at = (t: number) =>
        computeBattlePose(b, 0, i, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
      // No jump across the lineup -> march boundary...
      const before = at(lineupEnd - 1);
      const after = at(lineupEnd + 1);
      expect(Math.hypot(after.localX - before.localX, after.localZ - before.localZ)).toBeLessThan(1e-6);
      // ...and no jump anywhere else in the approach either.
      for (let t = b.startAt; t < b.clashAt - STEP; t += STEP) {
        const step = Math.hypot(at(t + STEP).localX - at(t).localX, at(t + STEP).localZ - at(t).localZ);
        expect(step).toBeLessThan(MARINE_SPACING);
      }
    }

    // And the squad stays spread out the whole way: at every moment of the
    // approach no two marines share a spot.
    for (let t = b.startAt; t < b.clashAt; t += 100) {
      const xs = Array.from({ length: MARINES_PER_SIDE }, (_, i) =>
        computeBattlePose(b, 0, i, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ).localX
      ).sort((a, b2) => a - b2);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(0);
    }
  });

  it("never plays the run stance while a marine is standing still", () => {
    // Regression: marines ran on the spot for the whole lineup phase, and
    // again through the staggered delay before their own advance started —
    // the run clip was chosen by phase rather than by actual movement.
    const b = battle();
    const STEP = 16;
    for (let i = 0; i < MARINES_PER_SIDE; i++) {
      for (let t = b.startAt; t < b.clashAt; t += STEP) {
        const now = computeBattlePose(b, 0, i, t, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
        if (now.stance !== "run") continue;
        const next = computeBattlePose(b, 0, i, t + STEP, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ);
        const travelled = Math.hypot(next.localX - now.localX, next.localZ - now.localZ);
        expect(travelled).toBeGreaterThan(0);
      }
    }
  });

  it("holds a constant standing/aiming crouchT throughout the firefight, not a crouch/pop cycle", () => {
    const b = battle();
    const samples = Array.from({ length: 40 }, (_, i) =>
      computeBattlePose(b, 0, 1, APPROACH_MS + (i / 40) * CLASH_MS, -0.4, 0, AXES.perpX, AXES.perpZ, AXES.fwdX, AXES.fwdZ)
    );
    expect(samples.every((p) => p.crouchT === 1)).toBe(true);
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
