// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { syncInfoOverlay, updateStructureInfoOverlay } from "./client-structure-info-overlay-dom.js";

const modal = (hero: string, body: string, close = "button"): string =>
  `<div class="structure-info-backdrop"></div><div class="structure-info-modal">` +
  `<button data-structure-info-close="${close}">×</button>` +
  `<div class="structure-info-scroll">\n<div class="hero"><img src="${hero}" /></div>\n<section>${body}</section>\n</div></div>`;

// happy-dom never clamps scrollTop. A real browser loses the offset when the
// scroll container is destroyed and clamps it while content is swapped, so
// model that: any child mutation of the scroll body resets scrollTop to 0.
const trackScroll = (host: HTMLElement): HTMLElement => {
  const scroll = host.querySelector<HTMLElement>(".structure-info-scroll")!;
  let top = 0;
  Object.defineProperty(scroll, "scrollTop", { configurable: true, get: () => top, set: (value: number) => { top = value; } });
  const reset = (): void => { top = 0; };
  for (const method of ["replaceChildren", "append"] as const) {
    const original = scroll[method].bind(scroll);
    scroll[method] = (...nodes: (Node | string)[]) => { reset(); original(...nodes); };
  }
  for (const child of Array.from(scroll.children)) {
    const original = child.replaceWith.bind(child);
    child.replaceWith = (...nodes: (Node | string)[]) => { reset(); original(...nodes); };
  }
  return scroll;
};

const renderer = (html: () => string) => ({ structure: html, crystal: (key: string) => modal("c.png", key) });

describe("syncInfoOverlay / updateStructureInfoOverlay", () => {
  it("keeps the scroll position across identical HUD re-renders", () => {
    const host = document.createElement("div");
    const open = { structureInfoKey: "ANCILLARY_FACTORY", crystalAbilityInfoKey: "" };
    syncInfoOverlay(host, open, renderer(() => modal("a.png", "a")));
    const scroll = trackScroll(host);
    scroll.scrollTop = 240;
    syncInfoOverlay(host, open, renderer(() => modal("a.png", "a")));
    expect(host.querySelector(".structure-info-scroll")).toBe(scroll);
    expect(scroll.scrollTop).toBe(240);
    expect(host.style.display).toBe("grid");
  });

  it("swaps only changed sections, keeping the hero image mounted and restoring the scroll offset", () => {
    const host = document.createElement("div");
    updateStructureInfoOverlay(host, "structure:ASTRAL_DOCK", modal("a.png", "0/3"));
    const scroll = trackScroll(host);
    const image = host.querySelector("img");
    scroll.scrollTop = 120;
    updateStructureInfoOverlay(host, "structure:ASTRAL_DOCK", modal("a.png", "1/3"));
    expect(host.querySelector(".structure-info-scroll")).toBe(scroll);
    expect(host.querySelector("img")).toBe(image);
    expect(host.querySelector("section")?.textContent).toBe("1/3");
    expect(scroll.scrollTop).toBe(120);
  });

  it("remounts when the modal shell outside the scroll body changes", () => {
    const host = document.createElement("div");
    updateStructureInfoOverlay(host, "structure:FORT", modal("a.png", "a"));
    updateStructureInfoOverlay(host, "structure:FORT", modal("a.png", "a", "other"));
    expect(host.querySelector("[data-structure-info-close]")?.getAttribute("data-structure-info-close")).toBe("other");
  });

  it("remounts for a different structure and hides when everything closes", () => {
    const host = document.createElement("div");
    syncInfoOverlay(host, { structureInfoKey: "FORT", crystalAbilityInfoKey: "" }, renderer(() => modal("a.png", "fort")));
    const scroll = host.querySelector(".structure-info-scroll");
    syncInfoOverlay(host, { structureInfoKey: "", crystalAbilityInfoKey: "AETHER_BRIDGE" }, renderer(() => ""));
    expect(host.querySelector(".structure-info-scroll")).not.toBe(scroll);
    expect(host.querySelector("section")?.textContent).toBe("AETHER_BRIDGE");
    syncInfoOverlay(host, { structureInfoKey: "", crystalAbilityInfoKey: "" }, renderer(() => ""));
    expect(host.innerHTML).toBe("");
    expect(host.style.display).toBe("none");
  });
});
