import { describe, expect, it } from "vitest";
import { DIPLOMACY_OVERLAY_COLORS, DIPLOMACY_SELF_COLOR, diplomacyOwnerColor } from "../client-diplomacy-overlay/client-diplomacy-overlay.js";
import { createIdentityOwnerColor } from "./client-identity-owner-color.js";
import { createSeparatedOwnerColor } from "./client-owner-color-separation.js";
import { fallbackOwnerColor, resolveOwnerColor } from "./client-owner-colors.js";

// Playtest 2026-11-12 (pt-predator): "I picked dark red, but my badge/avatar shows blue. Tove's avatar changed
// red -> gold when the truce started." The HUD crests were coloured by the map's overlay colour, which the
// Diplomacy lens swaps for a fixed self blue and stance tints.
const lensState = () => ({
  me: "jay",
  playerColors: new Map([["jay", "#8b0000"], ["tove", "#3f51b5"]]),
  allies: [] as string[],
  activeTruces: [{ otherPlayerId: "tove" }] as never,
  showDiplomacyOverlay: true
});

describe("createIdentityOwnerColor", () => {
  it("keeps the player's chosen colour on their own crest while the Diplomacy lens is on", () => {
    const state = lensState();
    expect(diplomacyOwnerColor(state)("jay")).toBe(DIPLOMACY_SELF_COLOR); // the map lens does recolour
    expect(createIdentityOwnerColor(state)("jay")).toBe("#8b0000");
  });

  it("does not turn a rival's crest into a stance colour when a truce starts", () => {
    const state = lensState();
    expect(diplomacyOwnerColor(state)("tove")).toBe(DIPLOMACY_OVERLAY_COLORS.truce);
    const crest = createIdentityOwnerColor(state)("tove");
    expect(crest).not.toBe(DIPLOMACY_OVERLAY_COLORS.truce);
    // Same rival spacing as the map's Terrain lens, so crests still match territory there.
    const terrainLens = createSeparatedOwnerColor((id) => resolveOwnerColor(id, state.playerColors, fallbackOwnerColor), () => state.me);
    expect(crest).toBe(terrainLens("tove"));
  });

  it("follows colour changes without being rebuilt", () => {
    const state = lensState();
    const identity = createIdentityOwnerColor(state);
    state.playerColors.set("jay", "#228b22");
    expect(identity("jay")).toBe("#228b22");
  });
});
