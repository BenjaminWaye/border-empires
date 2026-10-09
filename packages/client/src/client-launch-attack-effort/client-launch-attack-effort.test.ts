// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { defendingFortVariant, requiredMusterForFort } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { attackCommitForTarget } from "../client-attack-commit/client-attack-commit.js";
import { hideEffortConfirmSheet, isEffortConfirmSheetOpen } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { launchAttacksWithEffort, type AttackLaunchDeps } from "./client-launch-attack-effort.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const setup = (targets: Array<Partial<Tile> & { x: number; y: number }>) => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 1_000;
  state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me" } as Tile);
  for (const t of targets) state.tiles.set(keyFor(t.x, t.y), { terrain: "LAND", ownerId: "enemy", ...t } as Tile);
  const queueSpecificTargets = vi.fn((keys: string[]) => ({ queued: keys.length, skipped: 0, queuedKeys: keys }));
  const deps: AttackLaunchDeps = {
    keyFor,
    pickOriginForTarget: () => state.tiles.get("0,0"),
    isTileOwnedByAlly: () => false,
    queueSpecificTargets,
    processActionQueue: vi.fn(() => true),
    attackQueueFailureReason: () => "nope",
    pushFeed: vi.fn(),
    showCaptureAlert: vi.fn(),
    hideTileActionMenu: vi.fn()
  };
  return { state, deps, queueSpecificTargets };
};

const click = (selector: string): void => {
  const el = document.querySelector<HTMLButtonElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  el.click();
};

const floorOf = (tile: Tile): number => requiredMusterForFort(defendingFortVariant(tile.fort));

describe("Launch Attack effort sheet", () => {
  afterEach(() => hideEffortConfirmSheet());

  it("queues a FRONTIER target immediately, with no sheet (extra effort buys nothing there)", () => {
    const { state, deps, queueSpecificTargets } = setup([{ x: 1, y: 0, ownershipState: "FRONTIER" }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    expect(isEffortConfirmSheetOpen()).toBe(false);
    expect(queueSpecificTargets).toHaveBeenCalledWith(["1,0"]);
  });

  it("opens the sheet for a SETTLED target and only queues once the player confirms, carrying the chosen effort", () => {
    const { state, deps, queueSpecificTargets } = setup([{ x: 1, y: 0, ownershipState: "SETTLED" }]);
    const tile = state.tiles.get("1,0")!;
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: tile }, deps);
    expect(isEffortConfirmSheetOpen()).toBe(true);
    expect(queueSpecificTargets).not.toHaveBeenCalled();

    click('[data-effort-preset="double"]');
    click("[data-effort-go]");
    expect(isEffortConfirmSheetOpen()).toBe(false);
    expect(queueSpecificTargets).toHaveBeenCalledWith(["1,0"]);
    expect(attackCommitForTarget(state, 1, 0)).toBe(floorOf(tile) * 2);
  });

  it("records nothing extra when the player keeps Normal", () => {
    const { state, deps, queueSpecificTargets } = setup([{ x: 1, y: 0, ownershipState: "SETTLED" }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    click("[data-effort-go]");
    expect(queueSpecificTargets).toHaveBeenCalledTimes(1);
    expect(attackCommitForTarget(state, 1, 0)).toBeUndefined();
  });

  it("does not queue anything when the sheet is cancelled", () => {
    const { state, deps, queueSpecificTargets } = setup([{ x: 1, y: 0, ownershipState: "SETTLED" }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    click("[data-effort-cancel]");
    expect(queueSpecificTargets).not.toHaveBeenCalled();
  });

  it("shows one presets-only sheet for several targets and applies the multiplier to each settled target's own floor", () => {
    const { state, deps, queueSpecificTargets } = setup([
      { x: 1, y: 0, ownershipState: "SETTLED" },
      { x: 2, y: 0, ownershipState: "SETTLED", fort: { status: "active", variant: "FORT" } as Tile["fort"] },
      { x: 3, y: 0, ownershipState: "FRONTIER" }
    ]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0", "2,0", "3,0"], scope: "region", selected: state.tiles.get("1,0") }, deps);
    expect(document.querySelector("[data-effort-slider]")).toBeNull();
    click('[data-effort-preset="extra"]');
    click("[data-effort-go]");
    expect(queueSpecificTargets).toHaveBeenCalledWith(["1,0", "2,0", "3,0"]);
    expect(attackCommitForTarget(state, 1, 0)).toBe(Math.ceil(floorOf(state.tiles.get("1,0")!) * 1.5));
    expect(attackCommitForTarget(state, 2, 0)).toBe(Math.ceil(floorOf(state.tiles.get("2,0")!) * 1.5));
    expect(attackCommitForTarget(state, 3, 0)).toBeUndefined();
  });
});
