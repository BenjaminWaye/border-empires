// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { applyImperialWardActivatedMessage, imperialWardChipHtml, bindImperialWardChip } from "./client-imperial-ward.js";
import type { ClientState } from "../client-state/client-state.js";

const baseState = (): Pick<ClientState, "imperialWardCharges" | "imperialWardActiveUntil"> => ({
  imperialWardCharges: undefined,
  imperialWardActiveUntil: undefined
});

describe("applyImperialWardActivatedMessage", () => {
  it("sets activeUntil and chargesRemaining from the message payload", () => {
    const state = baseState() as ClientState;
    applyImperialWardActivatedMessage(state, { activeUntil: 5_000, chargesRemaining: 2 });
    expect(state.imperialWardActiveUntil).toBe(5_000);
    expect(state.imperialWardCharges).toBe(2);
  });

  it("ignores malformed payloads without throwing", () => {
    const state = baseState() as ClientState;
    applyImperialWardActivatedMessage(state, {});
    expect(state.imperialWardActiveUntil).toBeUndefined();
    expect(state.imperialWardCharges).toBeUndefined();
  });
});

describe("imperialWardChipHtml", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there are no charges and no active window", () => {
    expect(imperialWardChipHtml(baseState())).toBe("");
  });

  it("renders an activate button showing the charge count", () => {
    const html = imperialWardChipHtml({ imperialWardCharges: 3, imperialWardActiveUntil: undefined });
    expect(html).toContain("data-imperial-ward-activate");
    expect(html).toContain("(3)");
  });

  it("renders a countdown instead of the button while the ward is active", () => {
    const html = imperialWardChipHtml({ imperialWardCharges: 2, imperialWardActiveUntil: 1_000_000 + 65_000 });
    expect(html).toContain("Warded");
    expect(html).toContain("1:05");
    expect(html).not.toContain("data-imperial-ward-activate");
  });

  it("falls back to the button once the active window has passed", () => {
    const html = imperialWardChipHtml({ imperialWardCharges: 1, imperialWardActiveUntil: 1_000_000 - 1 });
    expect(html).toContain("data-imperial-ward-activate");
  });
});

describe("bindImperialWardChip", () => {
  it("wires the activate button click to send ACTIVATE_IMPERIAL_WARD", () => {
    document.body.innerHTML = `<div id="hud"><button data-imperial-ward-activate>Ward</button></div>`;
    const sendGameMessage = vi.fn().mockReturnValue(true);
    bindImperialWardChip(document.getElementById("hud")!, sendGameMessage);

    (document.querySelector("[data-imperial-ward-activate]") as HTMLButtonElement).click();

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "ACTIVATE_IMPERIAL_WARD" }, expect.any(String));
    document.body.innerHTML = "";
  });

  it("does nothing when the chip is not present", () => {
    document.body.innerHTML = `<div id="hud"></div>`;
    const sendGameMessage = vi.fn();
    expect(() => bindImperialWardChip(document.getElementById("hud")!, sendGameMessage)).not.toThrow();
    document.body.innerHTML = "";
  });
});
