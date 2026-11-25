// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BreakPactSheetOptions } from "../client-break-pact-sheet/client-break-pact-sheet.js";
import { bindProfileEditModal, profileEditModalHtml } from "./client-hud-profile-edit-overlay.js";

const makeState = (overrides: Record<string, unknown> = {}) => ({
  meName: "Old Name",
  me: "player-1",
  playerColors: new Map([["player-1", "#38b000"]]),
  suggestedColors: ["#38b000", "#f59e0b", "#3b82f6"],
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
    expect(onClose).toHaveBeenCalled();
  });

  it("selects the current name on focus and shows an n/24 count", () => {
    const state = makeState();
    const { overlayEl } = mount(state);
    const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]")!;
    nameInput.dispatchEvent(new FocusEvent("focus"));
    expect(nameInput.selectionStart).toBe(0);
    expect(nameInput.selectionEnd).toBe("Old Name".length);
    expect(overlayEl.querySelector("[data-profile-name-count]")!.textContent).toBe("8/24");
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
