// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { actionBarHtml } from "../client-hud-v2/client-hud-v2-action-bar.js";
import { tileFeatureLeadLines } from "../client-tile-overview-modifiers/client-tile-overview-modifiers.js";
import type { Tile, TileMenuView } from "../client-types.js";
import "./relic-capture-dialog.js";

afterEach(() => document.body.replaceChildren());

// Playtest 2026-11 (staging): "View relic installation" in the tile details did nothing:
// the HUD dropped every button but tech/structure links to plain text.
describe("View relic installation in the tile details", () => {
  it("is a real link that opens the relic dialog", () => {
    const tile: Tile = { x: 1, y: 2, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", naturalWonder: { type: "BASTION_FRAME", relicVersion: 1, remainingUses: 12 } };
    const lines = tileFeatureLeadLines(tile, "mine-settled", { me: "me", prettyToken: (v) => v, structureInfoButtonHtml: () => "", techCatalog: [] });
    const view: TileMenuView = { title: "Relic (1, 2)", subtitle: "Yours", tabs: ["actions"], overviewLines: lines, actions: [], buildings: [], crystal: [] };
    document.body.innerHTML = actionBarHtml(view, "details");
    const link = document.querySelector<HTMLButtonElement>("button[data-relic-state]");
    expect(link?.textContent).toBe("View relic installation");
    expect(link?.classList.contains("inline-info-link")).toBe(true);
    link!.click();
    expect(document.querySelector(".relic-capture-dialog")).not.toBeNull();
  });
});
