// Coverage for the walk-synthesis diff logic itself (client-map-3d-
// barbarian-overlay.ts), not the real asset — see
// client-map-3d-voidcrystal-colossus-asset.test.ts for that. The model
// module is mocked out so these run instantly and don't depend on network
// or the checked-in glb parsing successfully.
import { AnimationClip, Group, Object3D, Scene } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBarbarianOverlay, wasSettledCapture } from "./client-map-3d-barbarian-overlay.js";
import { VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME, VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME } from "./client-map-3d-voidcrystal-colossus-asset.js";
import type { ActiveBattleOverlay } from "./client-battle-overlay/client-battle-overlay.js";

const battle = (overrides: Partial<ActiveBattleOverlay>): ActiveBattleOverlay => ({
  originX: 0,
  originY: 0,
  targetX: 5,
  targetY: 5,
  attackerOwnerId: "barbarian-1",
  defenderOwnerId: "player-1",
  attackerWon: true,
  startAt: 0,
  clashAt: 0,
  endAt: 2000,
  fromSkirmish: false,
  ...overrides
});

// The colossus-vs-marines skirmish visual is out of scope here (its own
// module has its own tests) -- mocked to a no-op so this file doesn't also
// pay for/depend on the real marine model network load.
vi.mock("./client-map-3d-colossus-marine-skirmish.js", () => ({
  createColossusMarineSkirmish: () => ({ sync: () => {}, tick: () => {}, dispose: () => {} })
}));

// Minimal real clips so ensureClipAction() in the overlay finds usable
// "Attack"/"Walking" clips and actually exercises AnimationMixer, instead
// of silently no-op'ing because clips is empty.
const attackClip = new AnimationClip(VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME, 1, []);
const walkingClip = new AnimationClip(VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME, 1, []);

vi.mock("./client-map-3d-voidcrystal-colossus-asset.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client-map-3d-voidcrystal-colossus-asset.js")>();
  return {
    ...actual,
    loadVoidcrystalColossusTemplate: () =>
      Promise.resolve({
        root: new Group(),
        clips: new Map([
          [VOIDCRYSTAL_COLOSSUS_ATTACK_CLIP_NAME, attackClip],
          [VOIDCRYSTAL_COLOSSUS_WALKING_CLIP_NAME, walkingClip]
        ])
      })
  };
});

// Lets the pool-creation promise (loadVoidcrystalColossusTemplate().then(...))
// settle before a test drives clear/addInstance/commit/tick.
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const visibleOnes = (scene: Scene): Object3D[] => scene.children.filter((c) => c.visible);

describe("wasSettledCapture", () => {
  // Regression: a captured tile's OWN ownershipState is unconditionally
  // SETTLED for barbarian-1 regardless of what it captured (see
  // runtime-lock-resolution.ts), so it can't be used to tell a real fight
  // apart from a routine frontier land-grab -- this must derive the
  // distinction from the combat broadcast instead.
  it("is true when a won barbarian-attacker battle is registered for this tile", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "barbarian-1", attackerWon: true })]]);
    expect(wasSettledCapture(battles, "5,5")).toBe(true);
  });

  it("is false with no battle registered for this tile (a routine EXPAND land-grab)", () => {
    expect(wasSettledCapture(new Map(), "5,5")).toBe(false);
  });

  it("is false when the registered battle is for a different tile", () => {
    const battles = new Map([["9,9", battle({ attackerOwnerId: "barbarian-1", attackerWon: true })]]);
    expect(wasSettledCapture(battles, "5,5")).toBe(false);
  });

  it("is false when the battle's attacker isn't a barbarian", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "player-1", defenderOwnerId: "barbarian-1", attackerWon: true })]]);
    expect(wasSettledCapture(battles, "5,5")).toBe(false);
  });

  it("is false when the barbarian attacker LOST (no capture happened)", () => {
    const battles = new Map([["5,5", battle({ attackerOwnerId: "barbarian-1", attackerWon: false })]]);
    expect(wasSettledCapture(battles, "5,5")).toBe(false);
  });
});

describe("createBarbarianOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("places exactly one standing marker at the tile's world position", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    overlay.clear();
    overlay.addInstance("0,0", 10, 20, 3, 0, 0, false);
    overlay.commit();
    overlay.tick(1000);

    const visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(10);
    expect(visible[0]!.position.z).toBeCloseTo(20);
  });

  it("frontier capture: walks straight to the adjacent tile (no fight phase) and stands", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    overlay.clear();
    overlay.addInstance("0,0", 10, 10, 0, 0, 0, false);
    overlay.commit();
    overlay.tick(0);

    // (0,0) expanded to adjacent bare-land (1,0) -- not settled, so no fight.
    overlay.clear();
    overlay.addInstance("1,0", 11, 10, 0, 1, 0, false);
    overlay.commit();

    // First tick after commit lazily stamps the walk's own start time and
    // reads at exactly the origin (rawT=0) -- see tick()'s "running" branch.
    overlay.tick(0);
    let visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(10);

    // Mid-walk: strictly between the two tiles, not an instant pop.
    overlay.tick(5000);
    visible = visibleOnes(scene);
    expect(visible[0]!.position.x).toBeGreaterThan(10);
    expect(visible[0]!.position.x).toBeLessThan(11);

    // Long after the walk's duration: standing at the destination.
    overlay.tick(20_000);
    visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(11);
    expect(visible[0]!.position.z).toBeCloseTo(10);
  });

  it("mid-walk camera pan: shifts both the walk's start and destination by the same delta instead of drifting off the tile", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    overlay.clear();
    overlay.addInstance("0,0", 10, 10, 0, 0, 0, false);
    overlay.commit();
    overlay.tick(0);

    // Captures adjacent bare land (1,0) -- starts a 10s walk from (10,10) to (11,10).
    overlay.clear();
    overlay.addInstance("1,0", 11, 10, 0, 1, 0, false);
    overlay.commit();
    overlay.tick(0);

    overlay.tick(5000);
    const beforePanFraction = (visibleOnes(scene)[0]!.position.x - 10) / (11 - 10);
    expect(beforePanFraction).toBeCloseTo(0.5, 1);

    // Camera pans while the walk is still in flight (rebuildVisibleTerrain
    // re-centers on a new sceneOrigin): the SAME destination tile key is
    // reported again, now translated by (+100, +100) in the new
    // camera-relative frame -- as a real pan would produce, not a new tile.
    overlay.clear();
    overlay.addInstance("1,0", 111, 110, 0, 1, 0, false);
    overlay.commit();
    overlay.tick(5000);

    // Immediately after the pan, the visible fraction along the walk must
    // be unchanged (still ~50%) -- if only the destination shifted (the
    // bug), the colossus would suddenly read as having overshot or fallen
    // short relative to the newly-repositioned tile mesh.
    let visible = visibleOnes(scene);
    const afterPanFraction = (visible[0]!.position.x - 110) / (111 - 110);
    expect(afterPanFraction).toBeCloseTo(beforePanFraction, 1);

    // Finishing the walk lands exactly on the (now panned) destination, not
    // the pre-pan coordinates.
    overlay.tick(10_000);
    visible = visibleOnes(scene);
    expect(visible[0]!.position.x).toBeCloseTo(111);
    expect(visible[0]!.position.z).toBeCloseTo(110);
  });

  it("settled capture: walks to the destination FIRST, then fights in place there, then stands", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    // Frame 1: barbarian owns (0,0), world (10,10).
    overlay.clear();
    overlay.addInstance("0,0", 10, 10, 0, 0, 0, false);
    overlay.commit();
    overlay.tick(0);

    // Frame 2: (0,0) captured the adjacent SETTLED tile (1,0), world (11,10).
    overlay.clear();
    overlay.addInstance("1,0", 11, 10, 0, 1, 0, true);
    overlay.commit();
    // The walk's own start time is lazily stamped from tick()'s own nowMs
    // the first time it observes the "running" phase -- pin it at 0 so the
    // rest of this test can reason in absolute time from there.
    overlay.tick(0);

    // Mid-walk: strictly between the two tiles -- it travels BEFORE
    // fighting, not after.
    overlay.tick(5000);
    let visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeGreaterThan(10);
    expect(visible[0]!.position.x).toBeLessThan(11);

    // Crossing the walk's arrival (10_000ms, RUN_DURATION_MS) flips the
    // phase to "fighting" AT THE DESTINATION, not the origin -- this is
    // what distinguishes a fight from a frontier walk (which would just
    // idle here instead).
    overlay.tick(10_000);
    visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(11);
    expect(visible[0]!.position.z).toBeCloseTo(10);

    // Still fighting mid-window: still exactly at the destination, not
    // sliding anywhere.
    overlay.tick(10_000 + 500);
    visible = visibleOnes(scene);
    expect(visible[0]!.position.x).toBeCloseTo(11);
    expect(visible[0]!.position.z).toBeCloseTo(10);

    // Long after the fight window (FIGHT_DURATION_MS = 1500ms): standing
    // at the destination.
    overlay.tick(10_000 + 20_000);
    visible = visibleOnes(scene);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.x).toBeCloseTo(11);
    expect(visible[0]!.position.z).toBeCloseTo(10);
  });

  it("frees the slot when a barbarian tile is lost with no adjacent gain", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    overlay.clear();
    overlay.addInstance("5,5", 50, 50, 0, 5, 5, false);
    overlay.commit();
    overlay.tick(0);
    expect(visibleOnes(scene)).toHaveLength(1);

    // Tile captured by a player, or eaten by another barbarian tile far
    // away -- no adjacent barbarian gain this frame.
    overlay.clear();
    overlay.commit();
    overlay.tick(1000);

    expect(visibleOnes(scene)).toHaveLength(0);
    overlay.dispose();
  });

  it("caps at MAX_RENDERED_COLOSSI rather than throwing when barbarian tiles exceed the pool", async () => {
    const scene = new Scene();
    const overlay = createBarbarianOverlay(scene, 100);
    await flush();

    overlay.clear();
    for (let i = 0; i < 40; i += 1) {
      overlay.addInstance(`${i},0`, i, 0, 0, i, 0, false);
    }
    expect(() => overlay.commit()).not.toThrow();
    overlay.tick(0);
    expect(visibleOnes(scene).length).toBeLessThanOrEqual(24);
    overlay.dispose();
  });
});
