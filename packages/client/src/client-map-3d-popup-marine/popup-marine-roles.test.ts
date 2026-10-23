import { describe, expect, it } from "vitest";
import {
  APPROACH_MS,
  CLASH_MS,
  ROUT_MS,
  computeBattlePose,
  computeSkirmishPose,
  type BattleOverlayRenderEntry,
  type BattleOverlaySkirmishEntry,
  type MarinePose
} from "./popup-marine-timeline.js";
import { applyUnitRole, battleRoleFrame, chargeVictimIndex, MELEE_REACH, skirmishRoleFrame } from "./popup-marine-roles.js";

const LINEUP_LEAD = 0.16;
import type { MarineUnitRole } from "./popup-marine-units.js";
import { deathKitFor, dyingIndicesFor, marineKitFor } from "./popup-marine-timeline.js";

// Both sides share the tile's perpendicular axis; each faces the other.
const PERP = { x: 1, z: 0 };
const FWD: Record<0 | 1, { x: number; z: number }> = { 0: { x: 0, z: 1 }, 1: { x: 0, z: -1 } };
const SEED = 42;
// A slot that survives on side 0 whether it wins or loses, so its path
// through the rout is the one under test (a fallen unit lies where it fell).
const CHARGER = [1, 2, 3, 4, 5].find(
  (i) => ![true, false].some((winning) => dyingIndicesFor((s, j) => deathKitFor(SEED, s, j), 0, winning).has(i))
)!;

const skirmish: BattleOverlaySkirmishEntry = {
  srcWorldX: 0, srcWorldZ: -1, tgtWorldX: 0, tgtWorldZ: 0, srcSurfaceY: 0, tgtSurfaceY: 0,
  attackerColor: "#4fb3ff", defenderColor: "#ff5d5d", startAt: 0, hashSeed: SEED
};

const battle = (overrides: Partial<BattleOverlayRenderEntry> = {}): BattleOverlayRenderEntry => ({
  ...skirmish,
  attackerWon: true,
  startAt: 0,
  clashAt: APPROACH_MS,
  endAt: APPROACH_MS + CLASH_MS + ROUT_MS,
  fromSkirmish: false,
  ...overrides
});

const entry = (side: 0 | 1) => ({ x: -FWD[side].x * 0.46, z: -FWD[side].z * 0.46 });

const skirmishAt = (role: MarineUnitRole, side: 0 | 1, i: number, nowMs: number) => {
  const e = entry(side);
  const base = computeSkirmishPose(skirmish, side, i, nowMs, e.x, e.z, PERP.x, PERP.z, FWD[side].x, FWD[side].z);
  const frame = skirmishRoleFrame(skirmish, marineKitFor(SEED, side, i), nowMs);
  return applyUnitRole({ role, lineupLead: 0 }, base, frame, SEED, side, i, PERP.x, PERP.z, FWD[side].x, FWD[side].z);
};

const battleAt = (b: BattleOverlayRenderEntry, role: MarineUnitRole, side: 0 | 1, i: number, nowMs: number) => {
  const e = entry(side);
  const base = computeBattlePose(b, side, i, nowMs, e.x, e.z, PERP.x, PERP.z, FWD[side].x, FWD[side].z);
  const frame = battleRoleFrame(b, side, marineKitFor(SEED, side, i), nowMs);
  return applyUnitRole({ role, lineupLead: 0 }, base, frame, SEED, side, i, PERP.x, PERP.z, FWD[side].x, FWD[side].z);
};

const dist = (a: MarinePose, b: MarinePose): number => Math.hypot(a.localX - b.localX, a.localZ - b.localZ);

describe("charge role", () => {
  it("has a surviving slot to test with", () => expect(CHARGER).toBeDefined());

  it("a charger that falls lies at its melee spot through the rout, not back on the line", () => {
    const lost = battle({ attackerWon: false });
    const dying = [...dyingIndicesFor((s, j) => deathKitFor(SEED, s, j), 0, false)][0]!;
    const fellAt = battleAt(lost, "charge", 0, dying, lost.clashAt + CLASH_MS - 1).pose;
    const lying = battleAt(lost, "charge", 0, dying, lost.endAt - 1).pose;
    expect(lying.fallT).toBe(1);
    expect(lying.localX).toBeCloseTo(fellAt.localX, 6);
    expect(lying.localZ).toBeCloseTo(fellAt.localZ, 6);
  });

  const inFirefight = APPROACH_MS + CLASH_MS * 0.3;

  it("closes to melee range of the enemy that falls first, and fights it in melee instead of shooting", () => {
    const charger = skirmishAt("charge", 0, CHARGER, inFirefight);
    const victim = skirmishAt("line", 1, chargeVictimIndex(SEED, 0), APPROACH_MS);
    expect(dist(charger.pose, victim.pose)).toBeCloseTo(MELEE_REACH, 5);
    expect(charger.pose.stance).toBe("melee");
    expect(charger.pose.flash).toBe(0);
    expect(charger.firesBolts).toBe(false);
  });

  it("runs further than the line during the advance, from the same lineup spot", () => {
    const atLineup = skirmishAt("charge", 0, CHARGER, 10);
    expect(atLineup.pose).toEqual(skirmishAt("line", 0, CHARGER, 10).pose);
    const lineEngaged = skirmishAt("line", 0, CHARGER, inFirefight).pose;
    const chargeEngaged = skirmishAt("charge", 0, CHARGER, inFirefight).pose;
    expect(chargeEngaged.localZ).toBeGreaterThan(lineEngaged.localZ);
  });

  it("is already engaged where the skirmish left it when the resolved battle takes over", () => {
    const b = battle({ fromSkirmish: true });
    const fromSkirmish = skirmishAt("charge", 0, CHARGER, APPROACH_MS + CLASH_MS * 5.5).pose;
    const battleStart = battleAt(b, "charge", 0, CHARGER, b.clashAt).pose;
    expect(battleStart.localX).toBeCloseTo(fromSkirmish.localX, 6);
    expect(battleStart.localZ).toBeCloseTo(fromSkirmish.localZ, 6);
    expect(battleStart.stance).toBe("melee");
  });

  it("presses on from its melee spot when its side wins, and peels back when it loses", () => {
    const won = battle({ attackerWon: true });
    const lost = battle({ attackerWon: false });
    const clashEnd = won.clashAt + CLASH_MS;
    const engaged = battleAt(won, "charge", 0, CHARGER, clashEnd - 1).pose;
    const pushing = battleAt(won, "charge", 0, CHARGER, won.endAt - 1).pose;
    expect(pushing.localZ).toBeGreaterThanOrEqual(engaged.localZ);
    const retreating = battleAt(lost, "charge", 0, CHARGER, lost.endAt - 1).pose;
    const lineRetreat = battleAt(lost, "line", 0, CHARGER, lost.endAt - 1).pose;
    expect(retreating.localX).toBeCloseTo(lineRetreat.localX, 6);
    expect(retreating.localZ).toBeCloseTo(lineRetreat.localZ, 6);
  });
});

describe("support and braced roles", () => {
  const inFirefight = APPROACH_MS + CLASH_MS * 0.5;

  it("support holds the back rank, still firing, never kneeling", () => {
    for (let i = 0; i < 7; i++) {
      const line = skirmishAt("line", 0, i, inFirefight);
      const support = skirmishAt("support", 0, i, inFirefight);
      expect(support.pose.localZ).toBeLessThanOrEqual(line.pose.localZ + 1e-9);
      if (support.pose.fallT <= 0) expect(support.pose.stance).toBe("stand");
      expect(support.firesBolts).toBe(true);
    }
  });

  it("braced fires from a kneel in its own line spot", () => {
    for (let i = 0; i < 7; i++) {
      const line = skirmishAt("line", 0, i, inFirefight).pose;
      const braced = skirmishAt("braced", 0, i, inFirefight).pose;
      expect(braced.localX).toBe(line.localX);
      expect(braced.localZ).toBe(line.localZ);
      if (braced.fallT <= 0) expect(braced.stance).toBe("kneel");
    }
  });

  it("line leaves the base pose untouched", () => {
    const e = entry(0);
    const base = computeSkirmishPose(skirmish, 0, 2, inFirefight, e.x, e.z, PERP.x, PERP.z, FWD[0].x, FWD[0].z);
    expect(skirmishAt("line", 0, 2, inFirefight).pose).toEqual(base);
  });
});

describe("lineup lead for units too big for the rank", () => {
  const ledAt = (nowMs: number) => {
    const e = entry(0);
    const base = computeSkirmishPose(skirmish, 0, CHARGER, nowMs, e.x, e.z, PERP.x, PERP.z, FWD[0].x, FWD[0].z);
    const frame = skirmishRoleFrame(skirmish, marineKitFor(SEED, 0, CHARGER), nowMs);
    return applyUnitRole({ role: "support", lineupLead: LINEUP_LEAD }, base, frame, SEED, 0, CHARGER, PERP.x, PERP.z, FWD[0].x, FWD[0].z).pose;
  };

  it("waits LINEUP_LEAD ahead of its own rank slot while the squad lines up", () => {
    // Just before the lineup ends, when every member has popped in.
    const rank = skirmishAt("support", 0, CHARGER, 2400).pose;
    expect(rank.scale).toBe(1);
    expect(ledAt(2400).localZ - rank.localZ).toBeCloseTo(LINEUP_LEAD, 6);
  });

  it("has no lead left once engaged, so it ends up exactly on its role spot", () => {
    const t = APPROACH_MS + CLASH_MS * 0.5;
    expect(ledAt(t)).toEqual(skirmishAt("support", 0, CHARGER, t).pose);
  });
});
