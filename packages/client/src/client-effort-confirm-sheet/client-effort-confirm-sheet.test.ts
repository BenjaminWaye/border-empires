// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideEffortConfirmSheet, showEffortConfirmSheet } from "./client-effort-confirm-sheet.js";

// The sheet is styled by client-effort-confirm-sheet-style.css (the
// steampunk theme) rather than hard-coded navy inline styles; these pin the
// class/variable hooks that stylesheet relies on.
describe("showEffortConfirmSheet styling hooks", () => {
  afterEach(() => hideEffortConfirmSheet());

  const open = () =>
    showEffortConfirmSheet({ title: "Commit march", floor: 60, cap: 660, mode: "slider", onConfirm: vi.fn() });

  it("renders themed classes, not inline palette styles", () => {
    open();
    const card = document.querySelector<HTMLElement>(".effort-confirm-card")!;
    expect(card).toBeTruthy();
    expect(card.getAttribute("style")).toBeNull();
    expect(document.querySelector(".effort-confirm-range")).toBeTruthy();
    expect(document.querySelectorAll(".effort-confirm-preset")).toHaveLength(3);
    expect(document.querySelector(".effort-confirm-go")?.textContent).toBe("Go");
  });

  it("marks the chosen preset active and drives the slider's brass fill", () => {
    open();
    const slider = document.querySelector<HTMLInputElement>("[data-effort-slider]")!;
    expect(slider.style.getPropertyValue("--effort-fill")).toBe("0%");
    expect(document.querySelector('[data-effort-preset="normal"]')!.classList.contains("is-active")).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-effort-preset="double"]')!.click();
    expect(document.querySelector('[data-effort-preset="double"]')!.classList.contains("is-active")).toBe(true);
    expect(document.querySelector('[data-effort-preset="normal"]')!.classList.contains("is-active")).toBe(false);
    // Double = 120 on a 60-660 range: (120 - 60) / 600 = 10%.
    expect(slider.style.getPropertyValue("--effort-fill")).toBe("10%");
    expect(document.querySelector("[data-effort-value]")!.textContent).toBe("120");
  });
});
