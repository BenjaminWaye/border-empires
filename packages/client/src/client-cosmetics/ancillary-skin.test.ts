import { describe, expect, it, vi } from "vitest";
import type { PlayerCosmeticSelection } from "@border-empires/shared";

import { knownSquadGearFor, squadGearFields, squadGearWithSkin } from "../client-battle-overlay/client-battle-overlay.js";
import { marineModelFor } from "../client-map-3d-popup-marine/popup-marine-gear.js";
import { ANCILLARY_IVORY_2D, ancillaryHelmetFill2D, drawAncillaryDotHelmet2D } from "./ancillary-skin-2d.js";

const stateWith = (cosmetics: Array<[string, PlayerCosmeticSelection]>) => ({
  me: "me",
  tiles: new Map(),
  tilesRevision: 0,
  squadGearByOwner: new Map([["rival", { titanium: true }]]),
  playerCosmetics: new Map(cosmetics)
});

describe("ancillary skin follows its owner's squads", () => {
  it("adds nothing for an owner who shows no skin", () => {
    const gear = { titanium: true };
    expect(squadGearWithSkin(stateWith([]), "rival", gear)).toBe(gear);
    expect(knownSquadGearFor(stateWith([]), "rival")).toEqual({ titanium: true });
  });

  it("is resolved per owner, for rivals and for the local player alike", () => {
    const state = stateWith([["rival", { ancillary: "ancillary-ivory" }], ["me", { ancillary: "ancillary-ivory" }]]);
    expect(knownSquadGearFor(state, "rival")).toEqual({ titanium: true, skin: "ancillary-ivory" });
    expect(knownSquadGearFor(state, "me")).toEqual({ skin: "ancillary-ivory" });
    expect(knownSquadGearFor(state, "other")).toEqual({});
  });

  it("is added to a resolved battle's broadcast gear, which never carries it", () => {
    const state = stateWith([["rival", { ancillary: "ancillary-ivory" }]]);
    const fields = squadGearFields(state, "rival", "other", { attackerGear: { umbrite: true }, defenderGear: {} });
    expect(fields).toEqual({ attackerGear: { umbrite: true, skin: "ancillary-ivory" }, defenderGear: {} });
  });

  it("never changes which soldier model a squad wears", () => {
    expect(marineModelFor({ skin: "ancillary-ivory" })).toBe("standard");
    expect(marineModelFor({ titanium: true, skin: "ancillary-ivory" })).toBe("heavy");
  });
});

describe("ancillary skin on the 2D map", () => {
  it("repaints only the helmet", () => {
    expect(ancillaryHelmetFill2D("#ff0000", undefined)).toBe("#ff0000");
    expect(ancillaryHelmetFill2D("#ff0000", "default")).toBe("#ff0000");
    expect(ancillaryHelmetFill2D("#ff0000", "ancillary-ivory")).toBe(ANCILLARY_IVORY_2D);
  });

  it("draws no helmet dot for the standard look and a smaller one inside the owner-colour dot for a skin", () => {
    const ctx = { fillStyle: "", beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn() };
    drawAncillaryDotHelmet2D(ctx as unknown as CanvasRenderingContext2D, 5, 6, 4, undefined);
    expect(ctx.arc).not.toHaveBeenCalled();
    drawAncillaryDotHelmet2D(ctx as unknown as CanvasRenderingContext2D, 5, 6, 4, "ancillary-ivory");
    expect(ctx.arc).toHaveBeenCalledWith(5, 6, 2, 0, Math.PI * 2);
    expect(ctx.fillStyle).toBe(ANCILLARY_IVORY_2D);
  });
});
