import { AnimationClip, Group, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBarbarianLossBattles, createBarbarianLossOverlay, type BarbarianLossBattle } from "./client-map-3d-barbarian-loss-overlay.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";
import { VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME } from "./client-map-3d-voidcrystal-colossus-asset.js";

const heightfield = { elevationAt: () => 0, cornerYAt: () => 0 } as never;

const battle = (overrides: Partial<ActiveBattleOverlay>): ActiveBattleOverlay => ({
  originX: 0,
  originY: 0,
  targetX: 5,
  targetY: 5,
  attackerOwnerId: "player-1",
  defenderOwnerId: "barbarian-1",
  attackerWon: true,
  startAt: 0,
  clashAt: 0,
  endAt: 2000,
  fromSkirmish: false,
  ...overrides
});

const attackClip = new AnimationClip(VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME, 1, []);

vi.mock("./client-map-3d-voidcrystal-colossus-asset.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client-map-3d-voidcrystal-colossus-asset.js")>();
  return {
    ...actual,
    loadVoidcrystalColossusTemplate: () => Promise.resolve({ root: new Group(), clips: new Map([[VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME, attackClip]]) })
  };
});

// The colossus-vs-marines skirmish visual is out of scope here (its own
// module has its own tests) -- mocked to a no-op so this file doesn't also
// pay for/depend on the real marine model network load.
vi.mock("./client-map-3d-colossus-marine-skirmish.js", () => ({
  createColossusMarineSkirmish: () => ({ sync: () => {}, tick: () => {}, dispose: () => {} })
}));

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// Colossus clones are Groups (from SkeletonUtils.clone); the shared smoke-
// particle mesh is the only non-Group child (always present in the scene,
// toggled visible once any death is dissolving) -- filter to Group so
// assertions target the colossus clones specifically.
const visibleColossi = (scene: Scene) => scene.children.filter((c) => c.visible && c.type === "Group");

describe("buildBarbarianLossBattles", () => {
  it("includes a barbarian ATTACKER that lost its attack", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "barbarian-1", defenderOwnerId: "player-1", attackerWon: false })]]);
    const result = buildBarbarianLossBattles(battles, heightfield, 0, 0);
    expect(result.has("5,5")).toBe(true);
  });

  it("includes a barbarian DEFENDER that was defeated by a player attacker (new: mirrors the attacker-loses case)", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "player-1", defenderOwnerId: "barbarian-1", attackerWon: true })]]);
    const result = buildBarbarianLossBattles(battles, heightfield, 0, 0);
    expect(result.has("5,5")).toBe(true);
  });

  it("excludes a barbarian ATTACKER that won (that's the win-case overlay's job, not this one's)", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "barbarian-1", defenderOwnerId: "player-1", attackerWon: true })]]);
    const result = buildBarbarianLossBattles(battles, heightfield, 0, 0);
    expect(result.has("5,5")).toBe(false);
  });

  it("excludes a barbarian DEFENDER that held (the attacker lost, no barbarian death to show)", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "player-1", defenderOwnerId: "barbarian-1", attackerWon: false })]]);
    const result = buildBarbarianLossBattles(battles, heightfield, 0, 0);
    expect(result.has("5,5")).toBe(false);
  });

  it("excludes a fight with no barbarian on either side", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "player-1", defenderOwnerId: "player-2", attackerWon: true })]]);
    const result = buildBarbarianLossBattles(battles, heightfield, 0, 0);
    expect(result.has("5,5")).toBe(false);
  });
});

describe("createBarbarianLossOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns a standing colossus at the target tile for a lost-attack battle", async () => {
    const scene = new Scene();
    const overlay = createBarbarianLossOverlay(scene);
    await flush();

    const battles = new Map<string, BarbarianLossBattle>([["5,5", { targetWorldX: 12, targetWorldZ: 8, surfaceY: 0, endAt: 2000 }]]);
    overlay.sync(battles, 0);
    overlay.tick(0);

    const visible = visibleColossi(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(12);
    expect(visible[0]!.position.z).toBeCloseTo(8);
    overlay.dispose();
  });

  it("shrinks the colossus toward its own endAt (the dissolve), then removes it once expired", async () => {
    const scene = new Scene();
    const overlay = createBarbarianLossOverlay(scene);
    await flush();

    const battles = new Map<string, BarbarianLossBattle>([["5,5", { targetWorldX: 0, targetWorldZ: 0, surfaceY: 0, endAt: 2000 }]]);
    overlay.sync(battles, 0);
    overlay.tick(0);
    const fullScale = visibleColossi(scene)[0]!.scale.x;
    expect(fullScale).toBeGreaterThan(0);

    // Still well before the dissolve window (endAt - 900ms) -- unchanged.
    overlay.sync(battles, 900);
    overlay.tick(900);
    expect(visibleColossi(scene)[0]!.scale.x).toBeCloseTo(fullScale);

    // Inside the dissolve window: visibly smaller than full scale.
    overlay.sync(battles, 1800);
    overlay.tick(1800);
    expect(visibleColossi(scene)[0]!.scale.x).toBeLessThan(fullScale);

    // Past its endAt: sync() retires the slot (battle map still has the
    // key, but nowMs >= endAt), nothing left visible.
    overlay.sync(battles, 2001);
    overlay.tick(2001);
    expect(visibleColossi(scene)).toHaveLength(0);
    overlay.dispose();
  });

  it("retires a slot immediately if its battle key disappears (pruned) before endAt", async () => {
    const scene = new Scene();
    const overlay = createBarbarianLossOverlay(scene);
    await flush();

    const battles = new Map<string, BarbarianLossBattle>([["5,5", { targetWorldX: 0, targetWorldZ: 0, surfaceY: 0, endAt: 5000 }]]);
    overlay.sync(battles, 0);
    overlay.tick(0);
    expect(visibleColossi(scene)).toHaveLength(1);

    overlay.sync(new Map(), 100);
    overlay.tick(100);
    expect(visibleColossi(scene)).toHaveLength(0);
    overlay.dispose();
  });

  it("caps concurrent deaths without throwing", async () => {
    const scene = new Scene();
    const overlay = createBarbarianLossOverlay(scene);
    await flush();

    const battles = new Map<string, BarbarianLossBattle>();
    for (let i = 0; i < 20; i += 1) battles.set(`${i},0`, { targetWorldX: i, targetWorldZ: 0, surfaceY: 0, endAt: 5000 });
    expect(() => overlay.sync(battles, 0)).not.toThrow();
    overlay.tick(0);
    expect(visibleColossi(scene).length).toBeLessThanOrEqual(6);
    overlay.dispose();
  });
});
