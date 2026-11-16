// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { updateStructureInfoOverlay } from "./client-structure-info-overlay-dom.js";

const modal = (body: string): string =>
  `<div class="structure-info-backdrop"></div><div class="structure-info-modal"><div class="structure-info-scroll"><p>${body}</p></div></div>`;

describe("updateStructureInfoOverlay", () => {
  it("keeps the scroll container and its offset across identical HUD re-renders", () => {
    const host = document.createElement("div");
    updateStructureInfoOverlay(host, "ANCILLARY_FACTORY", modal("a"));
    const scroll = host.querySelector<HTMLElement>(".structure-info-scroll")!;
    scroll.scrollTop = 240;
    updateStructureInfoOverlay(host, "ANCILLARY_FACTORY", modal("a"));
    expect(host.querySelector(".structure-info-scroll")).toBe(scroll);
    expect(scroll.scrollTop).toBe(240);
  });

  it("updates changed content in place without resetting the scroll offset", () => {
    const host = document.createElement("div");
    updateStructureInfoOverlay(host, "ANCILLARY_FACTORY", modal("a"));
    const scroll = host.querySelector<HTMLElement>(".structure-info-scroll")!;
    scroll.scrollTop = 120;
    updateStructureInfoOverlay(host, "ANCILLARY_FACTORY", modal("b"));
    expect(host.querySelector(".structure-info-scroll")).toBe(scroll);
    expect(scroll.textContent).toBe("b");
    expect(scroll.scrollTop).toBe(120);
  });

  it("remounts when a different structure opens and clears when closed", () => {
    const host = document.createElement("div");
    updateStructureInfoOverlay(host, "ANCILLARY_FACTORY", modal("a"));
    const scroll = host.querySelector<HTMLElement>(".structure-info-scroll")!;
    updateStructureInfoOverlay(host, "FORT", modal("fort"));
    expect(host.querySelector(".structure-info-scroll")).not.toBe(scroll);
    expect(host.textContent).toBe("fort");
    updateStructureInfoOverlay(host, "", "");
    expect(host.innerHTML).toBe("");
  });
});
