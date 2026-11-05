import { describe, expect, it } from "vitest";
import { DIPLOMACY_OVERLAY_COLORS, DIPLOMACY_SELF_COLOR, diplomacyOverlayKey, diplomacyOwnerColor, diplomacyStanceLookup } from "./client-diplomacy-overlay.js";

const truce = (otherPlayerId: string) => ({ otherPlayerId, otherPlayerName: otherPlayerId, startedAt: 0, endsAt: 1, createdByPlayerId: "me" });

describe("diplomacy overlay stance", () => {
  const stanceOf = diplomacyStanceLookup({ me: "me", allies: ["a"], activeTruces: [truce("t")] });

  it("classes every other owner by your standing with them, barbarians as hostile", () => {
    expect(["a", "t", "x", "barbarian-1"].map(stanceOf)).toEqual(["ally", "truce", "hostile", "hostile"]);
  });

  it("leaves your own and unowned land untinted", () => {
    expect(stanceOf("me")).toBeUndefined();
    expect(stanceOf(undefined)).toBeUndefined();
  });

  it("keys the 3D rebuild only while the overlay is on", () => {
    expect(diplomacyOverlayKey({ me: "me", allies: ["a"], activeTruces: [], showDiplomacyOverlay: false })).toBe("");
    expect(diplomacyOverlayKey({ me: "me", allies: ["b", "a"], activeTruces: [truce("t")], showDiplomacyOverlay: true })).toBe("on:a,b|t");
  });
});

describe("diplomacy view colours", () => {
  // Regression: the view drew translucent tiles over each empire's land instead of recolouring it.
  it("swaps every empire's owner colour for its stance while on, yours for a fixed You colour", () => {
    const state = { me: "me", allies: ["a"], activeTruces: [truce("t")], showDiplomacyOverlay: true };
    const colorOf = diplomacyOwnerColor(state);
    expect(["a", "t", "x", "barbarian-1"].map(colorOf)).toEqual([
      DIPLOMACY_OVERLAY_COLORS.ally, DIPLOMACY_OVERLAY_COLORS.truce, DIPLOMACY_OVERLAY_COLORS.hostile, DIPLOMACY_OVERLAY_COLORS.hostile
    ]);
    // Regression: your own land kept your colour, which could match a stance colour (a green empire read as an ally).
    expect(colorOf("me")).toBe(DIPLOMACY_SELF_COLOR);
    expect(Object.values(DIPLOMACY_OVERLAY_COLORS)).not.toContain(DIPLOMACY_SELF_COLOR);
    state.showDiplomacyOverlay = false;
    expect(colorOf("me")).toBeUndefined();
    expect(colorOf("a")).toBeUndefined();
  });

  it("follows a new alliance as soon as the allies list is replaced", () => {
    const state = { me: "me", allies: [] as string[], activeTruces: [], showDiplomacyOverlay: true };
    const colorOf = diplomacyOwnerColor(state);
    expect(colorOf("a")).toBe(DIPLOMACY_OVERLAY_COLORS.hostile);
    state.allies = ["a"];
    expect(colorOf("a")).toBe(DIPLOMACY_OVERLAY_COLORS.ally);
  });
});
