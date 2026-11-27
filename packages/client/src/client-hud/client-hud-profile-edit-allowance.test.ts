// @vitest-environment happy-dom
// Playtest 2026-11-27 + owner rule: name, colour and crest each change once per Sector Contest.
// The Edit dialog showed "0/24" next to the existing name, so players feared saving would wipe it
// or spend their name change. Each field now says what is left, a used one is disabled, an empty
// name box says it keeps the name, and the confirm lists every change being spent (crest included).
import type { CosmeticId, PlayerCosmeticSelection } from "@border-empires/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { applyPlayerAppearanceMessage } from "../client-player-style-message/client-player-style-message.js";
import { applyPlayerProfileFields, profileChangeUsed, resetProfileChangeAllowance } from "../client-profile-change-allowance/client-profile-change-allowance.js";
import { applyProfileSaveRejection, settleProfileEditOutcome } from "../client-profile-edit-outcome/client-profile-edit-outcome.js";
import { cancelCrestSave, settleCrestSaveFromError } from "../client-profile-edit-crest/client-profile-edit-crest.js";
import { bindProfileEditModal, profileEditModalHtml } from "./client-hud-profile-edit-overlay.js";

const makeState = () => ({
  meName: "House Ash",
  me: "player-1",
  playerColors: new Map([["player-1", "#38b000"]]),
  playerNames: new Map<string, string>(),
  suggestedColors: ["#38b000", "#f59e0b", "#3b82f6"],
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(),
  ownedCosmetics: ["crest-anchor"] as CosmeticId[],
  authSessionReady: true
});

const mount = () => {
  const calls: BreakPactSheetOptions[] = [];
  const overlayEl = document.createElement("div");
  const state = makeState();
  overlayEl.innerHTML = profileEditModalHtml(state);
  document.body.appendChild(overlayEl);
  const sendGameMessage = vi.fn().mockReturnValue(true);
  bindProfileEditModal({
    state,
    overlayEl,
    sendGameMessage,
    pushFeed: vi.fn(),
    updateFirebaseDisplayName: vi.fn().mockResolvedValue(undefined),
    setPendingDisplayNameChange: vi.fn(),
    setPendingColorChange: vi.fn(),
    onClose: vi.fn(),
    showConfirm: (options) => {
      calls.push(options);
      return true;
    },
    hideConfirm: vi.fn()
  });
  return { overlayEl, sendGameMessage, calls };
};

const q = <T extends Element>(root: Element, selector: string): T | null => root.querySelector<T>(selector);

afterEach(() => {
  settleProfileEditOutcome({ ok: false, reason: "test over" });
  cancelCrestSave();
  resetProfileChangeAllowance();
  document.body.innerHTML = "";
});

describe("profile edit dialog allowances", () => {
  it("labels each field with what is left this contest, and disables a used one", () => {
    applyPlayerProfileFields({ suggestedColors: [] }, { nameChangeUsed: false, colorChangeUsed: true }, true);
    applyPlayerAppearanceMessage({ type: "COSMETICS_STATE", owned: [], selected: {}, crestChangeUsed: true }, {
      state: { ...makeState(), playerVisualStyles: new Map(), playerShieldUntil: new Map(), cosmeticsRequested: false } as never,
      authProfileNameEl: { value: "" },
      authProfileColorEl: { value: "" },
      syncAuthOverlay: () => {},
      renderHud: () => {}
    });
    const { overlayEl } = mount();
    expect(q(overlayEl, '[data-profile-allowance="name"]')?.textContent).toBe("Name · 1 change left");
    expect(q(overlayEl, '[data-profile-allowance="color"]')?.textContent).toBe("Colour · used");
    expect(q(overlayEl, '[data-profile-allowance="crest"]')?.textContent).toBe("Crest · used");
    expect(q<HTMLInputElement>(overlayEl, "[data-profile-edit-name]")?.disabled).toBe(false);
    expect(q<HTMLInputElement>(overlayEl, "[data-profile-edit-color]")?.disabled).toBe(true);
    expect(Array.from(overlayEl.querySelectorAll<HTMLButtonElement>("[data-profile-edit-swatch]")).every((b) => b.disabled)).toBe(true);
    expect(Array.from(overlayEl.querySelectorAll<HTMLButtonElement>("[data-profile-edit-crest]")).every((b) => b.disabled)).toBe(true);
  });

  it("shows no label and disables nothing while the gateway has not said", () => {
    const { overlayEl } = mount();
    expect(overlayEl.querySelector("[data-profile-allowance]")).toBeNull();
    expect(q<HTMLInputElement>(overlayEl, "[data-profile-edit-name]")?.disabled).toBe(false);
  });

  it("an empty name box says it keeps the name instead of showing 0/24", () => {
    const { overlayEl } = mount();
    const input = q<HTMLInputElement>(overlayEl, "[data-profile-edit-name]")!;
    const count = q(overlayEl, "[data-profile-name-count]")!;
    expect(count.textContent).toBe("Blank keeps name");
    input.value = "House Birch";
    input.dispatchEvent(new Event("input"));
    expect(count.textContent).toBe("11/24");
  });

  it("a crest-only change asks first, lists only the crest, and sends no SET_PROFILE", () => {
    const { overlayEl, sendGameMessage, calls } = mount();
    q<HTMLButtonElement>(overlayEl, '[data-profile-edit-crest="crest-anchor"]')!.click();
    q<HTMLButtonElement>(overlayEl, "[data-profile-edit-save]")!.click();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.consequences).toEqual(["Crest"]);
    expect(sendGameMessage).not.toHaveBeenCalled();
    calls[0]!.onConfirm();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_COSMETIC", slot: "crest", cosmeticId: "crest-anchor" }, expect.any(String));
    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "SET_PROFILE" }), expect.anything());
  });

  it("a colour-only change lists only the colour and keeps the name", () => {
    const { overlayEl, sendGameMessage, calls } = mount();
    q<HTMLInputElement>(overlayEl, "[data-profile-edit-color]")!.value = "#f59e0b";
    q<HTMLButtonElement>(overlayEl, "[data-profile-edit-save]")!.click();
    expect(calls[0]?.consequences).toEqual(["Colour: #f59e0b"]);
    calls[0]!.onConfirm();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_PROFILE", displayName: "House Ash", color: "#f59e0b" }, expect.any(String));
  });

  it("a limit refusal marks that field used", () => {
    const deps = {
      state: { me: "player-1", playerColors: new Map(), pendingDisplayNameChange: "X", pendingColorChange: "" },
      authProfileColorEl: { value: "" },
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      pushFeed: vi.fn()
    };
    applyProfileSaveRejection(deps, "DISPLAY_NAME_LIMIT", { message: "Name already changed this contest." });
    expect(profileChangeUsed("name")).toBe(true);
    expect(profileChangeUsed("color")).toBeUndefined();
    settleCrestSaveFromError("COSMETIC_LIMIT", "Crest already changed this contest.", "crest");
    expect(profileChangeUsed("crest")).toBe(true);
  });
});
