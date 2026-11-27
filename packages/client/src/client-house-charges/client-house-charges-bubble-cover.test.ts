// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { houseChargesBubbleCovered } from "./client-house-charges-bubble-cover.js";

// Playtest 2026-11-26: the docked "0/2" cards drew over the tile sheet's title, its gold primary button (with the
// "Showing: …" note), the Expansion-queued popup's Center button and the Build list.
describe("House Charges bubble steps aside for sheets and popups", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="hud-v2-tile" hidden></section>
      <section id="hud-v2-build" hidden></section>
      <div id="capture-card" style="display:none"></div>
      <div id="placement-overlay" style="display:none"></div>`;
  });

  it("is uncovered while only the map shows", () => {
    expect(houseChargesBubbleCovered(document)).toBe(false);
  });

  it("is covered while the tile sheet is open", () => {
    document.getElementById("hud-v2-tile")!.hidden = false;
    expect(houseChargesBubbleCovered(document)).toBe(true);
  });

  it("is covered while the Build list is open", () => {
    document.getElementById("hud-v2-build")!.hidden = false;
    expect(houseChargesBubbleCovered(document)).toBe(true);
  });

  it("is covered while the capture popup (Expansion queued · Center) shows", () => {
    document.getElementById("capture-card")!.style.display = "grid";
    expect(houseChargesBubbleCovered(document)).toBe(true);
  });

  it("is covered while a placement bar shows", () => {
    document.getElementById("placement-overlay")!.style.display = "flex";
    expect(houseChargesBubbleCovered(document)).toBe(true);
  });

  it("is wired into the HUD frame's bubble hide flag", () => {
    const hud = readFileSync(new NodeUrl("../client-hud-v2/client-hud-v2.ts", import.meta.url), "utf8");
    expect(hud).toMatch(/const bubbleHidden = [^;]*houseChargesBubbleCovered\(document\);/);
  });
});
