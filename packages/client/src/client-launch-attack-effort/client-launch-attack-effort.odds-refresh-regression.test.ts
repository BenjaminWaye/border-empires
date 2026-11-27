// @vitest-environment happy-dom
// 2026-11-26 playtest: on a garrisoned tile the Launch Attack sheet read 37% at
// Normal, Extra and Double, and the region sheet's win chance vanished after
// Double. The sheet closes the tile menu, so the attack preview (5s TTL) aged
// out under it and the odds line lost its base number.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { hideEffortConfirmSheet } from "../client-effort-confirm-sheet/client-effort-confirm-sheet.js";
import { attackEffortSheetTargetKey, launchAttacksWithEffort, type AttackLaunchDeps } from "./client-launch-attack-effort.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const setup = (targets: Array<{ x: number; y: number }>) => {
  const state = createInitialState();
  state.me = "me";
  state.manpowerCap = 1_000;
  state.tiles.set("0,0", { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);
  for (const t of targets) state.tiles.set(keyFor(t.x, t.y), { terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED", ...t } as Tile);
  state.attackPreview = { fromKey: "0,0", toKey: "1,0", valid: true, winChance: 0.37, atkEff: 10, defEff: 13, receivedAt: Date.now() } as NonNullable<typeof state.attackPreview>;
  const deps: AttackLaunchDeps = {
    keyFor,
    pickOriginForTarget: () => state.tiles.get("0,0"),
    isTileOwnedByAlly: () => false,
    queueSpecificTargets: vi.fn((keys: string[]) => ({ queued: keys.length, skipped: 0, queuedKeys: keys })),
    processActionQueue: vi.fn(() => true),
    attackQueueFailureReason: () => "nope",
    pushFeed: vi.fn(),
    showCaptureAlert: vi.fn(),
    hideTileActionMenu: vi.fn()
  };
  return { state, deps };
};

const info = (): string => document.querySelector("[data-effort-info]")?.textContent ?? "";
const click = (selector: string): void => document.querySelector<HTMLButtonElement>(selector)!.click();

describe("Launch Attack effort sheet odds after the preview ages out", () => {
  afterEach(() => {
    hideEffortConfirmSheet();
    vi.useRealTimers();
  });

  it("still moves the single-target win chance with the effort once the cached preview has expired", () => {
    vi.useFakeTimers();
    const { state, deps } = setup([{ x: 1, y: 0 }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    expect(info()).toContain("Win 37% · ");
    vi.advanceTimersByTime(6_000);
    click('[data-effort-preset="double"]');
    expect(info()).toContain("Win 54% · ");
    click('[data-effort-preset="normal"]');
    expect(info()).toContain("Win 37% · ");
  });

  it("keeps the region sheet's win chance after Double once the cached preview has expired", () => {
    vi.useFakeTimers();
    const { state, deps } = setup([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0", "2,0"], scope: "region", selected: state.tiles.get("1,0") }, deps);
    expect(info()).toContain("Win 37% · ");
    vi.advanceTimersByTime(6_000);
    click('[data-effort-preset="double"]');
    expect(info()).toContain("Win 54% · ");
  });

  it("names the sheet's target for the preview keepalive while it is open, and forgets it on close", () => {
    const { state, deps } = setup([{ x: 1, y: 0 }]);
    launchAttacksWithEffort(state, { targetKeys: ["1,0"], scope: "single", selected: state.tiles.get("1,0") }, deps);
    expect(attackEffortSheetTargetKey()).toBe("1,0");
    click("[data-effort-cancel]");
    expect(attackEffortSheetTargetKey()).toBeUndefined();
  });
});
