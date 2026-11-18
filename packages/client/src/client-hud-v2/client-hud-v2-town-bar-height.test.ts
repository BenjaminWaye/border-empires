// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { syncTownBarHeight, TOWN_BAR_HEIGHT_VAR } from "./client-hud-v2-town-bar-height.js";

const setup = (height: number): { host: HTMLElement; bar: HTMLElement } => {
  const host = document.createElement("div");
  const bar = document.createElement("div");
  host.appendChild(bar);
  bar.getBoundingClientRect = () => ({ height } as DOMRect);
  return { host, bar };
};

describe("syncTownBarHeight", () => {
  it("publishes the bar's full height so the panels above end where a two-row bar starts", () => {
    const { host, bar } = setup(171.4);
    syncTownBarHeight(bar);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("172px");
  });

  it("falls back to the stylesheet reserve while the bar has no layout", () => {
    const { host, bar } = setup(0);
    host.style.setProperty(TOWN_BAR_HEIGHT_VAR, "150px");
    syncTownBarHeight(bar);
    expect(host.style.getPropertyValue(TOWN_BAR_HEIGHT_VAR)).toBe("");
  });

  it("ignores a missing bar", () => {
    expect(() => syncTownBarHeight(null)).not.toThrow();
  });
});
