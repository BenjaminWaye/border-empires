import { describe, expect, it } from "vitest";
import { computeGarrisonPose, garrisonStartFor, GARRISON_FADE_MS, type GarrisonRenderEntry } from "./popup-marine-garrison.js";
import {
  APPROACH_MS,
  CLASH_MS,
  LINEUP_MS,
  MARINES_PER_SIDE,
  ROUT_MS,
  WINNER_DEATHS,
  computeBattlePose,
  computeSkirmishPose,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry
} from "./popup-marine-timeline.js";

const SEED = 6 * 92821 + 5;
const FWD = { fwdX: 1, fwdZ: 0 };

const garrison = (endsAt: number): GarrisonRenderEntry => ({
  ...FWD, tgtWorldX: 0, tgtWorldZ: 0, tgtSurfaceY: 0, color: "#f00", hashSeed: SEED, endsAt
});

const indices = Array.from({ length: MARINES_PER_SIDE }, (_, i) => i);

describe("capture-hold garrison", () => {
  it("is the capturing squad's survivors: one fewer than a full squad per winner death", () => {
    const standing = indices.filter((i) => computeGarrisonPose(garrison(10_000), i, 0).scale > 0);
    expect(standing).toHaveLength(MARINES_PER_SIDE - WINNER_DEATHS);
  });

  // Seamless hand-off: the marines who won the capture battle stop exactly
  // where its rout push left them instead of jumping into a new formation.
  it("stands where the winning squad finished the capture battle", () => {
    const battle: BattleOverlayRenderEntry = {
      srcWorldX: -1, srcWorldZ: 0, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: "#f00", defenderColor: "#00f", attackerWon: true,
      // Resolved battles start already at the firing line (see client-battle-overlay.ts).
      startAt: -APPROACH_MS, clashAt: 0, endAt: CLASH_MS + ROUT_MS, fromSkirmish: false, hashSeed: SEED
    };
    for (const i of indices) {
      const g = computeGarrisonPose(garrison(10_000), i, battle.endAt);
      if (g.scale === 0) continue;
      const won = computeBattlePose(battle, 0, i, battle.endAt, -0.46, 0, 0, 1, 1, 0);
      expect(g.localX).toBeCloseTo(won.localX, 6);
      expect(g.localZ).toBeCloseTo(won.localZ, 6);
    }
  });

  it("fades out over the last moments of the hold", () => {
    const i = indices.find((j) => computeGarrisonPose(garrison(10_000), j, 0).scale > 0)!;
    expect(computeGarrisonPose(garrison(10_000), i, 10_000 - GARRISON_FADE_MS / 2).scale).toBeCloseTo(0.5, 5);
    expect(computeGarrisonPose(garrison(10_000), i, 10_000).scale).toBe(0);
  });

  it("starts a defending squad from the garrison's own spots, already standing", () => {
    const skirmish: BattleOverlaySkirmishEntry = {
      srcWorldX: 0, srcWorldZ: -1, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
      attackerColor: "#00f", defenderColor: "#f00", startAt: 0, hashSeed: SEED, defenderGarrison: FWD
    };
    for (const i of indices) {
      const start = garrisonStartFor(FWD, SEED, i)!;
      const pose = computeSkirmishPose(skirmish, 1, i, LINEUP_MS / 10, 0, 0.46, -1, 0, 0, -1, undefined, start);
      if (start.absent) {
        expect(pose.scale).toBe(0);
        continue;
      }
      expect(pose.scale).toBe(1);
      expect(pose.localX).toBeCloseTo(start.localX, 6);
      expect(pose.localZ).toBeCloseTo(start.localZ, 6);
    }
  });

  it("has no garrison start when the tile isn't held", () => {
    expect(garrisonStartFor(undefined, SEED, 0)).toBeUndefined();
  });
});
