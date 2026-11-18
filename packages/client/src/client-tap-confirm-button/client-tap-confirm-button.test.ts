// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createTapConfirmButton, tapConfirmButtonPosition } from "./client-tap-confirm-button.js";

const size = { width: 200, height: 64, viewportWidth: 375, viewportHeight: 812 };

describe("tapConfirmButtonPosition", () => {
  it("centres the prompt right above the tapped point, clear of the fingertip", () => {
    const { left, top } = tapConfirmButtonPosition({ ...size, clientX: 180, clientY: 400 });
    expect(left).toBe(80);
    expect(top + size.height).toBeLessThan(400);
    expect(top + size.height).toBeGreaterThan(400 - 64);
  });

  it("flips below the tap when there is no room above, and stays on a phone-width screen", () => {
    const nearTop = tapConfirmButtonPosition({ ...size, clientX: 5, clientY: 100 });
    expect(nearTop.top).toBeGreaterThan(100);
    expect(nearTop.left).toBe(8);
    const nearRight = tapConfirmButtonPosition({ ...size, clientX: 370, clientY: 805 });
    expect(nearRight.left + size.width).toBeLessThanOrEqual(375 - 8);
    expect(nearRight.top + size.height).toBeLessThanOrEqual(812 - 8);
  });
});

describe("createTapConfirmButton", () => {
  const button = (): HTMLButtonElement => document.querySelector(".tap-confirm-btn") as HTMLButtonElement;

  it("shows the action and cost, and one tap confirms", () => {
    const prompt = createTapConfirmButton(document);
    const onConfirm = vi.fn();
    prompt.notePoint(200, 400);
    prompt.offer({ label: "Expand To", cost: "15 m.p." }, onConfirm);
    expect(prompt.isVisible()).toBe(true);
    expect(button().textContent).toBe("Expand To15 m.p.");
    button().click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(prompt.isVisible()).toBe(false);
  });

  it("hides on a press anywhere else (pan, another tile) without confirming", () => {
    const prompt = createTapConfirmButton(document);
    const onConfirm = vi.fn();
    prompt.offer({ label: "Launch Attack" }, onConfirm);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(prompt.isVisible()).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("a disabled offer can't confirm, and no offer means no prompt", () => {
    const prompt = createTapConfirmButton(document);
    const onConfirm = vi.fn();
    prompt.offer({ label: "Pick a highlighted tile", disabled: true }, onConfirm);
    button().click();
    expect(onConfirm).not.toHaveBeenCalled();
    prompt.offer(undefined, onConfirm);
    expect(prompt.isVisible()).toBe(false);
  });
});
