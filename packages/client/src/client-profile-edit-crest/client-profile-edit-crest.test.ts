// @vitest-environment happy-dom
import type { CosmeticId, PlayerCosmeticSelection } from "@border-empires/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { bindProfileEditModal, profileEditModalHtml } from "../client-hud/client-hud-profile-edit-overlay.js";
import { settleProfileEditOutcome } from "../client-profile-edit-outcome/client-profile-edit-outcome.js";
import { CREST_SAVE_NO_REPLY, crestEditorHtml, settleCrestSaveFromError, settleCrestSaveFromState } from "./client-profile-edit-crest.js";

// The House crest is chosen in the Edit Name, Colour & Crest dialog (owner,
// 2026-11-27) and saved with its Save button, closing only on the gateway's answer.

const makeState = (selection?: PlayerCosmeticSelection) => ({
  meName: "Harrow",
  me: "me",
  playerColors: new Map([["me", "#38b000"]]),
  playerNames: new Map<string, string>(),
  suggestedColors: ["#38b000", "#f59e0b"],
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(selection ? [["me", selection]] : []),
  ownedCosmetics: [] as CosmeticId[],
  authSessionReady: true
});

const mount = (state = makeState(), send = vi.fn((_payload: unknown, _message?: string) => true)) => {
  const overlayEl = document.createElement("div");
  overlayEl.innerHTML = profileEditModalHtml(state);
  document.body.appendChild(overlayEl);
  const confirms: BreakPactSheetOptions[] = [];
  const onClose = vi.fn();
  bindProfileEditModal({
    state, overlayEl, sendGameMessage: send, pushFeed: vi.fn(),
    updateFirebaseDisplayName: vi.fn().mockResolvedValue(undefined),
    setPendingDisplayNameChange: vi.fn(), setPendingColorChange: vi.fn(), onClose,
    showConfirm: (options) => { confirms.push(options); options.onConfirm(); return true; },
    hideConfirm: vi.fn()
  });
  const q = <T extends Element>(selector: string): T => overlayEl.querySelector<T>(selector) as T;
  const status = (): string => q<HTMLElement>("[data-profile-edit-status]").textContent ?? "";
  return { overlayEl, send, onClose, confirms, q, status };
};

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("crest in the Edit Name, Colour & Crest dialog", () => {
  it("previews the emblem in the chosen colour and crest", () => {
    const { q } = mount(makeState({ crest: "crest-cog" }));
    const preview = q<HTMLElement>("[data-profile-edit-preview]");
    expect(preview.querySelector("svg")).not.toBeNull();
    q<HTMLButtonElement>('[data-profile-edit-crest=""]').click();
    expect(preview.textContent).toBe("H");
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-kraken"]').click();
    expect(preview.querySelector("svg")).not.toBeNull();
    expect(q('[data-profile-edit-crest="crest-kraken"]').getAttribute("aria-pressed")).toBe("true");
    const color = q<HTMLInputElement>("[data-profile-edit-color]");
    color.value = "#3b82f6";
    color.dispatchEvent(new Event("input"));
    expect(preview.style.background).toContain("#3b82f6");
  });

  it("saves a crest-only change without the once-per-contest confirmation, and closes on the server's answer", async () => {
    const { q, send, onClose, confirms, status } = mount();
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-stag"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    expect(confirms).toHaveLength(0);
    expect(send.mock.calls.map(([payload]) => payload)).toEqual([{ type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-stag" }]);
    expect(status()).toBe("Saving…");
    expect(onClose).not.toHaveBeenCalled();
    settleCrestSaveFromState({ type: "COSMETICS_STATE", owned: [], selected: { crest: "crest-stag" } });
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves the crest off the once-per-contest confirmation when the name changes too, and saves both", async () => {
    const { q, send, confirms, onClose } = mount(makeState({ crest: "crest-cog" }));
    q<HTMLInputElement>("[data-profile-edit-name]").value = "Harrowgate";
    q<HTMLButtonElement>('[data-profile-edit-crest=""]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    // A crest has no once-per-contest limit, so the sheet does not list it.
    expect(confirms[0]?.consequences).toEqual(["Name: Harrowgate"]);
    // The crest goes once the server has confirmed the name (client-profile-edit-outcome.ts).
    expect(send.mock.calls.map(([payload]) => (payload as { type: string }).type)).toEqual(["SET_PROFILE"]);
    settleProfileEditOutcome({ ok: true });
    await flush();
    expect(send.mock.calls.map(([payload]) => (payload as { type: string }).type)).toEqual(["SET_PROFILE", "SET_COSMETIC"]);
    expect(send.mock.calls[1]?.[0]).toEqual({ type: "SET_COSMETIC", slot: "crest", cosmeticId: null });
    settleCrestSaveFromState({ type: "COSMETICS_STATE", owned: [], selected: {} });
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("still saves the crest when the server refuses the name, and shows both outcomes", async () => {
    const { q, send, onClose, status } = mount(makeState({ crest: "crest-cog" }));
    q<HTMLInputElement>("[data-profile-edit-name]").value = "Harrowgate";
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-stag"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    settleProfileEditOutcome({ ok: false, reason: "Name taken" });
    await flush();
    expect(send.mock.calls.map(([payload]) => payload)).toEqual([
      expect.objectContaining({ type: "SET_PROFILE" }),
      { type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-stag" }
    ]);
    settleCrestSaveFromState({ type: "COSMETICS_STATE", owned: [], selected: { crest: "crest-stag" } });
    await flush();
    expect(status()).toBe("Name taken · Crest saved");
    expect(q<HTMLButtonElement>("[data-profile-edit-save]").disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says the crest was not saved either when the name is refused and the crest is too", async () => {
    const { q, status } = mount(makeState({ crest: "crest-cog" }));
    q<HTMLInputElement>("[data-profile-edit-name]").value = "Harrowgate";
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-stag"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    settleProfileEditOutcome({ ok: false, reason: "Name taken" });
    await flush();
    settleCrestSaveFromError("COSMETIC_RATE_LIMITED", "", "crest");
    await flush();
    expect(status()).toBe("Name taken · Wait a moment, then save again.");
  });

  it("shows the server's refusal and stays open", async () => {
    const { q, onClose, status } = mount();
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-key"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    settleCrestSaveFromError("COSMETIC_RATE_LIMITED", "", "crest");
    await flush();
    expect(status()).toBe("Wait a moment, then save again.");
    expect(q<HTMLButtonElement>("[data-profile-edit-save]").disabled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores other errors and says so when the server never answers", async () => {
    vi.useFakeTimers();
    const { q, onClose, status } = mount();
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-key"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    settleCrestSaveFromError("COLOR_TAKEN", "taken", undefined);
    // A cosmetics refusal for another slot (or naming no slot) is not the crest's.
    settleCrestSaveFromError("COSMETIC_NOT_OWNED", "Not owned", "musterFlag");
    settleCrestSaveFromError("COSMETIC_RATE_LIMITED", "", undefined);
    expect(status()).toBe("Saving…");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(status()).toBe(CREST_SAVE_NO_REPLY);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("says Not sent when the crest cannot be sent", async () => {
    const { q, status, onClose } = mount(makeState(), vi.fn(() => false));
    q<HTMLButtonElement>('[data-profile-edit-crest="crest-key"]').click();
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    await flush();
    expect(status()).toBe("Not sent");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports No changes when nothing was changed", () => {
    const { q, status, send } = mount(makeState({ crest: "crest-cog" }));
    q<HTMLButtonElement>("[data-profile-edit-save]").click();
    expect(status()).toBe("No changes");
    expect(send).not.toHaveBeenCalled();
  });

  it("escapes the colour in the preview's style attribute", () => {
    const state = makeState();
    state.playerColors.set("me", '#fff" onmouseover="x');
    const host = document.createElement("div");
    host.innerHTML = crestEditorHtml(state);
    expect(host.querySelector("[data-profile-edit-preview]")?.getAttribute("onmouseover")).toBeNull();
  });
});
