// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { attackCommitForTarget } from "../client-attack-commit/client-attack-commit.js";
import { takeMusterFlagPlan } from "../client-muster-flag-plan/client-muster-flag-plan.js";
import { hideEffortConfirmSheet, isEffortConfirmSheetOpen } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { launchAttacksWithEffort, type AttackLaunchDeps } from "./client-launch-attack-effort.js";
import type { Tile } from "../client-types.js";

// docs/launch-attack-flag-placement-plan.md: when no muster flag is near,
// Launch Attack asks where to raise the new one (with a capture warning) in
// the same sheet as the effort level; with a flag near, it doesn't ask.

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Own land x 10..16, enemy land x 17..20 (rows 5..15). Firing tile (16, 10).
const setup = (target: Partial<Tile> = {}) => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 1_000;
  state.musterFlagLimit = 2;
  for (let y = 5; y <= 15; y += 1) {
    for (let x = 10; x <= 20; x += 1) {
      const enemy = x >= 17;
      state.tiles.set(keyFor(x, y), { x, y, terrain: "LAND", ownerId: enemy ? "enemy" : "me", ownershipState: enemy ? "FRONTIER" : "SETTLED" } as Tile);
    }
  }
  Object.assign(state.tiles.get("17,10")!, target);
  const queueSpecificTargets = vi.fn((keys: string[]) => ({ queued: keys.length, skipped: 0, queuedKeys: keys }));
  const deps: AttackLaunchDeps = {
    keyFor,
    pickOriginForTarget: (x, y) => state.tiles.get(keyFor(x - 1, y)),
    isTileOwnedByAlly: () => false,
    queueSpecificTargets,
    processActionQueue: vi.fn(() => true),
    attackQueueFailureReason: () => "nope",
    pushFeed: vi.fn(),
    showCaptureAlert: vi.fn(),
    hideTileActionMenu: vi.fn()
  };
  const launch = (keys = ["17,10"]) => launchAttacksWithEffort(state, { targetKeys: keys, scope: keys.length > 1 ? "bulk" : "single", selected: state.tiles.get(keys[0]!) }, deps);
  return { state, deps, queueSpecificTargets, launch };
};

const click = (selector: string): void => {
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  el.click();
};
const spotLabels = (): string[] => Array.from(document.querySelectorAll("[data-flag-spot] span")).map((el) => el.textContent ?? "");

describe("Launch Attack flag placement step", () => {
  afterEach(() => hideEffortConfirmSheet());

  it("asks where to raise the flag, with a capture warning, before attacking a frontier tile with no flag near", () => {
    const { state, queueSpecificTargets, launch } = setup();
    launch();
    expect(isEffortConfirmSheetOpen()).toBe(true);
    expect(document.querySelector(".effort-flag-spots-notice")?.textContent).toContain("Enemies can capture a flag");
    expect(spotLabels()).toEqual(["Safe (recommended)", "Closer", "On the border"]);
    // Extra manpower buys nothing on a frontier tile, so no effort controls.
    expect(document.querySelector("[data-effort-preset]")).toBeNull();
    expect(queueSpecificTargets).not.toHaveBeenCalled();

    click("[data-effort-go]");
    expect(queueSpecificTargets).toHaveBeenCalledWith(["17,10"]);
    expect(takeMusterFlagPlan(state, 17, 10)).toEqual({ x: 14, y: 10 });
  });

  it("records the spot the player picks", () => {
    const { state, launch } = setup();
    launch();
    click('[data-flag-spot="2"]');
    expect(document.querySelector('[data-flag-spot="2"]')?.getAttribute("aria-checked")).toBe("true");
    click("[data-effort-go]");
    expect(takeMusterFlagPlan(state, 17, 10)).toEqual({ x: 16, y: 10 });
  });

  it("shows the flag spots and the effort slider together for a garrisoned target", () => {
    const { state, launch } = setup({ ownershipState: "SETTLED" });
    launch();
    expect(spotLabels()).toHaveLength(3);
    expect(document.querySelector("[data-effort-slider]")).not.toBeNull();
    click('[data-effort-preset="double"]');
    click('[data-flag-spot="1"]');
    click("[data-effort-go]");
    expect(takeMusterFlagPlan(state, 17, 10)).toEqual({ x: 15, y: 10 });
    expect(attackCommitForTarget(state, 17, 10)).toBeGreaterThan(0);
  });

  it("skips the step when a flag is already near: no flag is created, so a frontier attack fires at once", () => {
    const { state, queueSpecificTargets, launch } = setup();
    state.tiles.get("12,10")!.muster = { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } as NonNullable<Tile["muster"]>;
    launch();
    expect(isEffortConfirmSheetOpen()).toBe(false);
    expect(queueSpecificTargets).toHaveBeenCalledWith(["17,10"]);
    expect(state.musterFlagPlanByTargetKey.size).toBe(0);
  });

  it("shows effort only for a garrisoned target when a flag is near", () => {
    const { state, launch } = setup({ ownershipState: "SETTLED" });
    state.tiles.get("12,10")!.muster = { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: Date.now() } as NonNullable<Tile["muster"]>;
    launch();
    expect(isEffortConfirmSheetOpen()).toBe(true);
    expect(document.querySelector("[data-flag-spot]")).toBeNull();
  });

  it("plans one shared spot for a bulk launch", () => {
    const { state, launch } = setup();
    launch(["17,10", "17,11"]);
    expect(spotLabels()).toHaveLength(3);
    click("[data-effort-go]");
    expect(takeMusterFlagPlan(state, 17, 10)).toEqual({ x: 14, y: 10 });
    expect(takeMusterFlagPlan(state, 17, 11)).toEqual({ x: 14, y: 10 });
  });

  it("cancelling records no plan and queues nothing", () => {
    const { state, queueSpecificTargets, launch } = setup();
    launch();
    click("[data-effort-cancel]");
    expect(queueSpecificTargets).not.toHaveBeenCalled();
    expect(state.musterFlagPlanByTargetKey.size).toBe(0);
  });
});
