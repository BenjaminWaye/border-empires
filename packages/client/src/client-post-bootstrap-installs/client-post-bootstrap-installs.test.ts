import { afterEach, describe, expect, it, vi } from "vitest";

const hud = vi.hoisted(() => ({ ownerColor: undefined as ((id: string) => string) | undefined }));

vi.mock("../client-hud-v2/client-hud-v2.js", () => ({ installHudV2: (deps: { ownerColor: (id: string) => string }) => { hud.ownerColor = deps.ownerColor; } }));
vi.mock("../client-hud-v2/client-resource-improvement-action.js", () => ({ installAutoImproveOptionBinding: () => undefined }));
vi.mock("../client-map-loading-view/client-map-loading-view.js", () => ({ isMapLoadingOverlayActive: () => false }));
vi.mock("../client-auto-settle-prompt/client-auto-settle-settings-ui.js", () => ({ installAutoSettleSettingsBinding: () => undefined }));
vi.mock("../client-auto-settle-prompt/client-auto-settle-tile-option.js", () => ({ installAutoSettleTileOptionBinding: () => undefined }));
vi.mock("../client-discovery-tips/client-discovery-tip-center.js", () => ({ installDiscoveryTipCenterBinding: () => undefined }));
vi.mock("../client-debug-season-end-overlay/client-debug-season-end-overlay.js", () => ({ installDebugSeasonEndOverlay: () => undefined }));
vi.mock("../client-map-name-labels/client-landmass-name-prompt.js", () => ({ createLandmassNamePrompt: () => ({ tick: () => undefined }) }));
vi.mock("../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js", () => ({ installDiplomacyOfferDock: () => undefined }));
vi.mock("../client-march-interaction/client-march-interaction.js", () => ({ installMarchInteraction: () => undefined }));
vi.mock("../client-salvage-tribute/client-salvage-tribute-sheet.js", () => ({ installSalvageTributeSheet: () => undefined }));
vi.mock("../client-refineries/refinery-picker-flow.js", () => ({ installRefineryPickers: () => undefined }));

import { installPostBootstrapHooks } from "./client-post-bootstrap-installs.js";

describe("installPostBootstrapHooks HUD crest colours (playtest 2026-11-12, pt-predator)", () => {
  afterEach(() => vi.useRealTimers());

  it("gives the HUD the empire's chosen colour, not the Diplomacy lens tint", () => {
    vi.useFakeTimers();
    const state = {
      me: "jay",
      playerColors: new Map([["jay", "#8b0000"], ["tove", "#3f51b5"]]),
      showDiplomacyOverlay: true,
      allies: [],
      activeTruces: [{ otherPlayerId: "tove" }]
    };
    installPostBootstrapHooks({
      state: state as never,
      renderHud: () => undefined,
      sendGameMessage: () => true,
      setActivePanel: () => undefined,
      actionFlow: {} as never,
      wrapX: (x) => x,
      wrapY: (y) => y,
      requestViewRefresh: () => undefined
    });
    expect(hud.ownerColor?.("jay")).toBe("#8b0000");
    expect(hud.ownerColor?.("tove")).not.toBe("#e0a845");
  });
});
