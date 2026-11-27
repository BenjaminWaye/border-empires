// @vitest-environment happy-dom
import type { CosmeticId, PlayerCosmeticSelection } from "@border-empires/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { settleProfileEditOutcome } from "../client-profile-edit-outcome/client-profile-edit-outcome.js";
import { bindProfileEditModal, profileEditModalHtml } from "./client-hud-profile-edit-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  meName: "Old Name",
  me: "player-1",
  playerColors: new Map([["player-1", "#38b000"]]),
  playerNames: new Map<string, string>(),
  suggestedColors: ["#38b000", "#f59e0b", "#3b82f6"],
  playerCosmetics: new Map<string, PlayerCosmeticSelection>(),
  ownedCosmetics: [] as CosmeticId[],
  authSessionReady: true,
  ...overrides
});

type ConfirmChoice = "confirm" | "cancel" | "blocked";

// Stands in for the in-game confirm sheet: records what it was asked and
// answers as `choice` says ("blocked" = the sheet could not be shown).
const fakeConfirm = (choice: ConfirmChoice) => {
  const calls: BreakPactSheetOptions[] = [];
  const show = (options: BreakPactSheetOptions): boolean => {
    calls.push(options);
    if (choice === "blocked") return false;
    if (choice === "confirm") options.onConfirm();
    else options.onCancel?.();
    return true;
  };
  return { show, calls };
};

const mount = (state: ReturnType<typeof makeState>, choice: ConfirmChoice = "confirm") => {
  const confirm = fakeConfirm(choice);
  const overlayEl = document.createElement("div");
  overlayEl.innerHTML = profileEditModalHtml(state);
  document.body.appendChild(overlayEl);
  const sendGameMessage = vi.fn().mockReturnValue(true);
  const pushFeed = vi.fn();
  const updateFirebaseDisplayName = vi.fn().mockResolvedValue(undefined);
  const setPendingDisplayNameChange = vi.fn();
  const setPendingColorChange = vi.fn();
  const onClose = vi.fn();
  bindProfileEditModal({
    state,
    overlayEl,
    sendGameMessage,
    pushFeed,
    updateFirebaseDisplayName,
    setPendingDisplayNameChange,
    setPendingColorChange,
    onClose,
    showConfirm: confirm.show,
    hideConfirm: vi.fn()
  });
  return { confirm, overlayEl, sendGameMessage, pushFeed, updateFirebaseDisplayName, setPendingDisplayNameChange, setPendingColorChange, onClose };
};

afterEach(() => {
  settleProfileEditOutcome({ ok: false, reason: "test over" });
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// The Save handler is async; .click() fires it but doesn't wait for it, so
// give its awaited calls a turn to settle before asserting.
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("profile edit overlay", () => {
  it("clicking a swatch sets the custom colour input and marks it selected", () => {
    const state = makeState();
    const { overlayEl } = mount(state);
    const swatch = overlayEl.querySelectorAll<HTMLButtonElement>("[data-profile-edit-swatch]")[1]!;
    swatch.click();
    const colorInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-color]")!;
    expect(colorInput.value.toLowerCase()).toBe("#f59e0b");
    expect(swatch.dataset.selected).toBe("true");
  });

  it("no-ops without confirming or sending when nothing changed", async () => {
    const state = makeState();
    const { confirm, overlayEl, sendGameMessage, pushFeed, onClose } = mount(state);
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();

    expect(confirm.calls).toHaveLength(0);
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("No changes to save.", "info", "info");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("confirms in-game before an actual rename, and sends nothing if canceled", async () => {
    const state = makeState();
    const confirmSpy = vi.spyOn(window, "confirm");
    const { confirm, overlayEl, sendGameMessage, onClose } = mount(state, "cancel");
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.value = "New Name";
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(confirm.calls).toHaveLength(1);
    expect(confirm.calls[0]!.subtitle).toBe("Once per Sector Contest.");
    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    // Cancel gives feedback instead of silently doing nothing.
    expect(overlayEl.querySelector("[data-profile-edit-status]")!.textContent).toBe("Not saved");
  });

  // Regression: embedded/webview browsers block window.confirm (returns false
  // or throws), so Save silently did nothing.
  it("still saves when window.confirm is blocked by the browser", async () => {
    const state = makeState();
    vi.spyOn(window, "confirm").mockImplementation(() => false);
    const { overlayEl, sendGameMessage, onClose } = mount(state, "confirm");
    overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!.value = "New Name";
    overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!.click();
    await flush();

    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    settleProfileEditOutcome({ ok: true });
    expect(onClose).toHaveBeenCalled();
  });

  it("saves when the confirm sheet cannot be shown, instead of doing nothing", async () => {
    const state = makeState();
    const { confirm, overlayEl, sendGameMessage, onClose } = mount(state, "blocked");
    overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!.value = "New Name";
    overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!.click();
    await flush();

    expect(confirm.calls).toHaveLength(1);
    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    settleProfileEditOutcome({ ok: true });
    expect(onClose).toHaveBeenCalled();
  });

  // Playtest 2026-11: typing into the pre-filled box appended to the old name and maxlength cut
  // the result ("House DovetailHouse Dove"). The box now starts empty with the name as placeholder.
  it("starts empty with the current name as placeholder, so typing can never append to it", async () => {
    const state = makeState({ meName: "House Dovetail" });
    const { overlayEl, sendGameMessage } = mount(state);
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    expect(nameInput.value).toBe("");
    expect(nameInput.placeholder).toBe("House Dovetail");
    expect(overlayEl.querySelector("[data-profile-name-count]")!.textContent).toBe("0/24");
    nameInput.value += "House Dove";
    overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!.click();
    await flush();
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_PROFILE", displayName: "House Dove", color: "#38b000" }, expect.any(String));
  });

  it("an empty box keeps the current name (a colour-only change)", async () => {
    const state = makeState();
    const { overlayEl, sendGameMessage } = mount(state);
    overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-color]")!.value = "#f59e0b";
    overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!.click();
    await flush();
    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "SET_PROFILE", displayName: "Old Name", color: "#f59e0b" }, expect.any(String));
  });

  // Playtest 2026-11: tapping Change closed the dialog at once, so a refused rename showed nothing.
  it("stays open until the server answers and shows a refusal in the dialog", async () => {
    const state = makeState();
    const { overlayEl, onClose } = mount(state);
    overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!.value = "New Name";
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();
    const status = overlayEl.querySelector("[data-profile-edit-status]")!;
    expect(onClose).not.toHaveBeenCalled();
    expect(status.textContent).toBe("Saving…");
    expect(saveBtn.disabled).toBe(true);
    settleProfileEditOutcome({ ok: false, reason: "You can only change your display name once per Sector Contest." });
    expect(onClose).not.toHaveBeenCalled();
    expect(status.textContent).toBe("You can only change your display name once per Sector Contest.");
    expect(saveBtn.disabled).toBe(false);
  });

  it("says so when the server never answers", async () => {
    vi.useFakeTimers();
    try {
      const state = makeState();
      const { overlayEl, onClose } = mount(state);
      overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!.value = "New Name";
      overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!.click();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(onClose).not.toHaveBeenCalled();
      expect(overlayEl.querySelector("[data-profile-edit-status]")!.textContent).toBe("No reply. Try again.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends the new name with the unchanged colour when only the name changes, then closes", async () => {
    const state = makeState();
    const { overlayEl, sendGameMessage, onClose } = mount(state);
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.value = "New Name";
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();

    expect(sendGameMessage).toHaveBeenCalledTimes(1);
    expect(sendGameMessage).toHaveBeenCalledWith(
      { type: "SET_PROFILE", displayName: "New Name", color: "#38b000" },
      expect.any(String)
    );
    settleProfileEditOutcome({ ok: true });
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the send fails synchronously, instead of closing as if it saved", async () => {
    const state = makeState();
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = profileEditModalHtml(state);
    document.body.appendChild(overlayEl);
    const sendGameMessage = vi.fn().mockReturnValue(false);
    const pushFeed = vi.fn();
    const onClose = vi.fn();
    bindProfileEditModal({
      state,
      overlayEl,
      sendGameMessage,
      pushFeed,
      updateFirebaseDisplayName: vi.fn().mockResolvedValue(undefined),
      setPendingDisplayNameChange: vi.fn(),
      setPendingColorChange: vi.fn(),
      onClose,
      showConfirm: fakeConfirm("confirm").show,
      hideConfirm: vi.fn()
    });
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.value = "New Name";
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();

    expect(sendGameMessage).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(overlayEl.innerHTML).not.toBe("");
    expect(overlayEl.querySelector("[data-profile-edit-status]")!.textContent).toBe("Not sent");
  });

  it("carries the new name (not the stale one) when both name and colour change", async () => {
    const state = makeState();
    const { overlayEl, sendGameMessage, onClose } = mount(state);
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.value = "New Name";
    const colorInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-color]")!;
    colorInput.value = "#f59e0b";
    const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]")!;
    saveBtn.click();
    await flush();

    // Regression guard: SET_PROFILE applies both fields verbatim, so a
    // second (colour) message that forwarded the stale old name would
    // silently revert the rename the first message just applied.
    for (const call of sendGameMessage.mock.calls) {
      expect(call[0]).toMatchObject({ displayName: "New Name" });
    }
    expect(sendGameMessage).toHaveBeenLastCalledWith(
      { type: "SET_PROFILE", displayName: "New Name", color: "#f59e0b" },
      expect.any(String)
    );
    settleProfileEditOutcome({ ok: true });
    expect(onClose).toHaveBeenCalled();
  });

  it("Cancel closes without sending anything", () => {
    const state = makeState();
    const { overlayEl, sendGameMessage, onClose } = mount(state);
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.value = "New Name";
    const cancelBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-cancel]")!;
    cancelBtn.click();

    expect(sendGameMessage).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    expect(overlayEl.innerHTML).toBe("");
  });
});
