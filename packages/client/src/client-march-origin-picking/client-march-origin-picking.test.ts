// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { MUSTER_MARCH_MAX_DISTANCE_TILES } from "@border-empires/shared";

vi.mock("../client-arrow-gesture-confirm.js", () => ({ handleArrowGestureConfirm: vi.fn() }));

import { handleArrowGestureConfirm } from "../client-arrow-gesture-confirm.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { MARCH_ORIGIN_BANNER_ID, syncMarchOriginPreview } from "./client-march-origin-banner.js";
import { checkMarchOrigin, handleMarchPickClick, startMarchOriginPicking } from "./client-march-origin-picking.js";

const own = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ...overrides });
const flag = (x: number, y: number): Tile => own(x, y, { muster: { ownerId: "me", amount: 0, mode: "HOLD", updatedAt: 0 } });

const stateWith = (tiles: Tile[]): ClientState => {
  const state = createInitialState();
  state.me = "me";
  state.musterFlagLimit = 2;
  state.tiles = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  return state;
};

const target = { x: 20, y: 10 };
const makeDeps = () => ({ pushFeed: vi.fn(), sendGameMessage: vi.fn(() => true), renderHud: vi.fn(), keyFor: (x: number, y: number) => `${x},${y}` });
const banner = (): HTMLElement | null => document.getElementById(MARCH_ORIGIN_BANNER_ID);

afterEach(() => {
  vi.mocked(handleArrowGestureConfirm).mockClear();
  document.body.innerHTML = "";
});

describe("March To origin picking", () => {
  it("shows a button per nearby muster flag plus how to raise a new flag, and a tapped flag opens the commit sheet", () => {
    const state = stateWith([flag(14, 10), own(17, 10)]);
    const deps = makeDeps();
    startMarchOriginPicking(state, target, deps);

    expect(state.marchOriginPicking).toEqual({ active: true, targetX: 20, targetY: 10 });
    const el = banner()!;
    expect(el.style.display).toBe("flex");
    expect(el.textContent).toContain("March to (20, 10)");
    expect(el.textContent).toContain("Select one of your nearby muster flags to march from");
    expect(el.textContent).toContain("Or tap a tile of your land to raise a new muster flag there");
    const flagButtons = el.querySelectorAll<HTMLButtonElement>("[data-march-origin-flag]");
    expect(Array.from(flagButtons, (b) => b.textContent)).toEqual(["Flag (14, 10) · 6 tiles"]);

    flagButtons[0]!.click();
    expect(handleArrowGestureConfirm).toHaveBeenCalledWith(state, { x: 14, y: 10 }, target, deps, { newFlag: false });
    expect(state.marchOriginPicking.active).toBe(false);
    expect(el.style.display).toBe("none");
  });

  it("leaves out the flag instructions when no muster flag is nearby", () => {
    const state = stateWith([flag(20 + MUSTER_MARCH_MAX_DISTANCE_TILES + 5, 10), own(17, 10)]);
    state.musterFlagLimit = 3;
    startMarchOriginPicking(state, target, makeDeps());
    const el = banner()!;
    expect(el.querySelectorAll("[data-march-origin-flag]")).toHaveLength(0);
    expect(el.textContent).not.toContain("Select one of your nearby muster flags");
    expect(el.textContent).toContain("Tap a tile of your land to raise a new muster flag there");
  });

  it("a tapped tile of the player's land raises a new flag there and marches it", () => {
    const state = stateWith([own(17, 10)]);
    const deps = makeDeps();
    startMarchOriginPicking(state, target, deps);
    expect(handleMarchPickClick(state, 17, 10, "visible", deps)).toBe(true);
    expect(handleArrowGestureConfirm).toHaveBeenCalledWith(state, { x: 17, y: 10 }, target, deps, { newFlag: true });
    expect(state.marchOriginPicking.active).toBe(false);
  });

  it("an invalid tap says why and keeps picking", () => {
    const state = stateWith([own(17, 10), { x: 18, y: 10, terrain: "LAND", ownerId: "rival" }]);
    const deps = makeDeps();
    startMarchOriginPicking(state, target, deps);
    expect(handleMarchPickClick(state, 18, 10, "visible", deps)).toBe(true);
    expect(deps.pushFeed).toHaveBeenLastCalledWith("Tap one of your muster flags or a tile of your own land to march from.", "combat", "warn");
    expect(handleArrowGestureConfirm).not.toHaveBeenCalled();
    expect(state.marchOriginPicking.active).toBe(true);
  });

  it("Cancel stops picking without marching", () => {
    const state = stateWith([own(17, 10)]);
    const deps = makeDeps();
    startMarchOriginPicking(state, target, deps);
    banner()!.querySelector<HTMLButtonElement>("[data-march-origin-cancel]")!.click();
    expect(state.marchOriginPicking.active).toBe(false);
    expect(banner()!.style.display).toBe("none");
    expect(handleMarchPickClick(state, 17, 10, "visible", deps)).toBe(false);
  });

  it("previews the march from the hovered tile of the player's land", () => {
    const state = stateWith([own(17, 10)]);
    startMarchOriginPicking(state, target, makeDeps());
    state.hover = { x: 17, y: 10 };
    syncMarchOriginPreview(state);
    expect(state.arrowGesture).toEqual({ origin: { x: 17, y: 10 }, target });
    state.hover = { x: 30, y: 30 };
    syncMarchOriginPreview(state);
    expect(state.arrowGesture).toBeUndefined();
  });
});

describe("checkMarchOrigin", () => {
  it("refuses tiles too far, besieged, across water, or a new flag over the cap", () => {
    const far = 20 - MUSTER_MARCH_MAX_DISTANCE_TILES - 2;
    expect(checkMarchOrigin(stateWith([own(far, 10)]), { x: far, y: 10 }, target)).toMatchObject({ ok: false, reason: expect.stringMatching(/^Too far/) });

    const besieged = stateWith([own(17, 10)]);
    besieged.incomingAttacksByTile.set("17,10", { attackerName: "Rival", resolvesAt: Date.now() + 60_000 } as never);
    expect(checkMarchOrigin(besieged, { x: 17, y: 10 }, target)).toMatchObject({ ok: false, reason: expect.stringMatching(/^Under siege/) });

    const sea: Tile[] = [];
    for (let y = 0; y <= 120; y += 1) for (const x of [18, 19]) sea.push({ x, y, terrain: "SEA" });
    // Mid-strait, so the flood can't walk around either end within its step cap.
    expect(checkMarchOrigin(stateWith([...sea, own(17, 60)]), { x: 17, y: 60 }, { x: 20, y: 60 })).toMatchObject({ ok: false, reason: expect.stringMatching(/^No route/) });

    const full = stateWith([flag(1, 1), flag(2, 2), own(17, 10)]);
    expect(checkMarchOrigin(full, { x: 17, y: 10 }, target)).toMatchObject({ ok: false, reason: expect.stringMatching(/^Muster flags full/) });
    expect(checkMarchOrigin(stateWith([flag(17, 10)]), { x: 17, y: 10 }, target)).toEqual({ ok: true, newFlag: false });
  });
});
