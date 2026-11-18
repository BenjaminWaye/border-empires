// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { createBuildingPlacementFlow } from "../client-building-placement/client-building-placement.js";
import { createTapConfirmButton } from "../client-tap-confirm-button/client-tap-confirm-button.js";
import { startRelayBeaconPlacement } from "./client-hud-v2-beacon-start.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

// Review of #2845: starting placement from the tracker had no map tap, so the confirm prompt sat at the
// last tap point (top-left on a fresh load, or over an unrelated tile) instead of by the centred beacon tile.
describe("tracker Relay Beacon step: confirm prompt", () => {
  it("anchors the prompt on the centred tile, and nothing is sent until Confirm", () => {
    const state = createInitialState();
    state.me = "me";
    state.zoom = 32;
    state.tiles.set(tileKey(20, 20), { x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile);
    const prompt = createTapConfirmButton(document);
    prompt.notePoint(3, 3); // a stale tap somewhere else
    const notePoint = vi.spyOn(prompt, "notePoint");
    const sendDevelopmentBuild = vi.fn(() => true);
    const flow = createBuildingPlacementFlow(state, {
      keyFor: tileKey, pushFeed: vi.fn(), renderHud: vi.fn(),
      placementOverlayEl: document.createElement("div"), placementLabelEl: document.createElement("div"),
      sendDevelopmentBuild, applyOptimisticStructureBuild: vi.fn(), sendGameMessage: vi.fn(() => true),
      startRelayBeaconChain: vi.fn(), confirmPrompt: prompt
    });
    const deps = { state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x: number) => x, wrapY: (y: number) => y, actionFlow: { renderPlacementOverlay: flow.renderPlacementOverlay } } as unknown as HudV2Deps;
    expect(startRelayBeaconPlacement(deps)).toBe(true);
    expect(notePoint).toHaveBeenCalledWith(window.innerWidth / 2, window.innerHeight / 2);
    expect(prompt.isVisible()).toBe(true);
    expect(sendDevelopmentBuild).not.toHaveBeenCalled();
    prompt.hide();
  });
});
