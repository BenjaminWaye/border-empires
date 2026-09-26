// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { CLOSE_BUTTON_SIZE, closeButtonPosition, mountPanelDismissal } from "./client-space-view-panels.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const build = () => {
  const screen = document.createElement("div");
  screen.innerHTML = `
    <div class="sv-top-bar"><button data-toggle>Duke</button></div>
    <div class="dk-hud"><button data-hud>Attention</button></div>
    <div class="sv-settings-panel" data-a hidden><button data-inside>Inside</button></div>
    <div class="sv-settings-panel" data-b hidden></div>
    <canvas data-canvas></canvas>`;
  document.body.append(screen);
  const dismissal = mountPanelDismissal(screen);
  const a = screen.querySelector<HTMLElement>("[data-a]")!;
  const b = screen.querySelector<HTMLElement>("[data-b]")!;
  const close = screen.querySelector<HTMLButtonElement>(".sv-panel-close")!;
  const press = (selector: string) => screen.querySelector(selector)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { screen, dismissal, a, b, close, press, tick };
};

describe("closeButtonPosition", () => {
  it("desktop: beside the panel's top-left corner, clear of the top bar", () => {
    expect(closeButtonPosition({ left: 800, top: 56, right: 1160 }, 1280)).toEqual({ left: 800 - CLOSE_BUTTON_SIZE - 8, top: 64 });
  });
  it("phone: above the bottom sheet's top-right corner", () => {
    expect(closeButtonPosition({ left: 8, top: 400, right: 367 }, 375)).toEqual({ left: 367 - CLOSE_BUTTON_SIZE, top: 400 - CLOSE_BUTTON_SIZE - 8 });
  });
});

describe("mountPanelDismissal", () => {
  it("shows a close button only while a panel is open", async () => {
    const { a, close, tick, screen } = build();
    expect(close.hidden).toBe(true);
    expect(screen.classList.contains("sv-panel-open")).toBe(false);
    a.hidden = false;
    await tick();
    expect(close.hidden).toBe(false);
    expect(screen.classList.contains("sv-panel-open")).toBe(true);
    a.hidden = true;
    await tick();
    expect(close.hidden).toBe(true);
    expect(screen.classList.contains("sv-panel-open")).toBe(false);
  });
  it("the close button closes the panel", async () => {
    const { a, close, tick } = build();
    a.hidden = false;
    await tick();
    close.click();
    expect(a.hidden).toBe(true);
    expect(close.hidden).toBe(true);
  });
  it("pressing outside closes it, whatever opened it", async () => {
    const { a, press, tick } = build();
    a.hidden = false;
    await tick();
    press("[data-canvas]");
    expect(a.hidden).toBe(true);
  });
  it("pressing inside the panel, the top bar or the HUD does not close it", async () => {
    const { a, press, tick } = build();
    a.hidden = false;
    await tick();
    for (const selector of ["[data-inside]", "[data-toggle]", "[data-hud]", "[data-a]"]) {
      press(selector);
      expect(a.hidden, selector).toBe(false);
    }
  });
  it("Escape closes it, and does nothing when nothing is open", async () => {
    const { a, tick } = build();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    a.hidden = false;
    await tick();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(a.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(a.hidden).toBe(true);
  });
  it("closeAll closes every panel", async () => {
    const { a, b, dismissal, tick } = build();
    a.hidden = false;
    b.hidden = false;
    await tick();
    dismissal.closeAll();
    expect(a.hidden && b.hidden).toBe(true);
  });
  it("dispose removes the button and stops listening", async () => {
    const { a, dismissal, screen, tick } = build();
    dismissal.dispose();
    expect(screen.querySelector(".sv-panel-close")).toBeNull();
    a.hidden = false;
    await tick();
    screen.querySelector("[data-canvas]")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(a.hidden).toBe(false);
  });
});
