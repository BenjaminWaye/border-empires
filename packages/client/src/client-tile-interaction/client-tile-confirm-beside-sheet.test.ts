// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTapConfirmButton } from "../client-tap-confirm-button/client-tap-confirm-button.js";
import { offerBesideTileSheet } from "./client-tile-interaction.js";

// Playtest 2026-11-26: on a phone a tile tap showed two "Expand To" buttons for one tile, the floating confirm
// prompt and the bottom tile sheet's gold primary button, and players didn't know which to press.
describe("tile-tap confirm prompt beside the tile sheet", () => {
  afterEach(() => {
    document.body.className = "";
    document.body.innerHTML = "";
  });

  const shownPrompts = (): number =>
    Array.from(document.querySelectorAll<HTMLElement>(".tap-confirm-btn")).filter((el) => el.style.display !== "none").length;

  it("shows no floating prompt on the phone layout, where the sheet already carries the action", () => {
    document.body.className = "hud-v2 hud-v2-compact";
    const button = createTapConfirmButton(document);
    button.offer(offerBesideTileSheet({ label: "Expand To", cost: "6 expand" }), vi.fn());
    expect(shownPrompts()).toBe(0);
    expect(button.isVisible()).toBe(false);
  });

  it("keeps the floating prompt on the desktop layout", () => {
    document.body.className = "hud-v2";
    const button = createTapConfirmButton(document);
    button.offer(offerBesideTileSheet({ label: "Expand To", cost: "6 expand" }), vi.fn());
    expect(shownPrompts()).toBe(1);
    expect(document.querySelector(".tap-confirm-label")?.textContent).toBe("Expand To");
  });

  it("passes a live offer through unchanged off the phone layout", () => {
    const live = () => ({ label: "Launch Attack" });
    expect(offerBesideTileSheet(live)).toBe(live);
    expect(offerBesideTileSheet(undefined)).toBeUndefined();
  });

  it("is applied to both tile-tap prompts in the action flow, not to placement", () => {
    const flow = readFileSync(new NodeUrl("../client-action-flow.ts", import.meta.url), "utf8");
    expect(flow.match(/confirmButton\.offer\(offerBesideTileSheet\(/g)).toHaveLength(2);
    expect(flow.match(/confirmButton\.offer\(/g)).toHaveLength(2);
  });
});
