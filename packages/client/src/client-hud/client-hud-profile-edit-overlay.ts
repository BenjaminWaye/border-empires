// "Edit Name & Colour" overlay, opened from Settings > Account. Genuinely
// reuses the onboarding profile-setup screen's design: the same colour-swatch
// picker (client-auth-ui.ts's syncColorSwatchButtons, shared with the actual
// onboarding panel) and the same CSS classes (.auth-color-block,
// .auth-panel-title, etc.), just with edit-specific copy and a Cancel button
// the mandatory first-run onboarding doesn't have. Follows the same
// lazy-build-once-while-open overlay pattern as
// client-bug-report/client-bug-report-hud.ts, so it never needs a
// focus-preserving re-render guard: this HTML is only (re)built on the
// closed -> open transition, never while the fields are being edited.
import type { Auth } from "firebase/auth";
import { syncColorSwatchButtons } from "../client-auth-ui/client-auth-ui.js";
import type { ClientState } from "../client-state/client-state.js";
import type { FeedSeverity, FeedType } from "../client-types.js";
import { updateFirebaseDisplayNameBestEffort, updateSettingsColor, updateSettingsDisplayName } from "./client-hud-settings.js";

// ---------------------------------------------------------------------------
// Module-level open state
// ---------------------------------------------------------------------------

let profileEditOpen = false;
export const isProfileEditOpen = (): boolean => profileEditOpen;
export const setProfileEditOpen = (open: boolean): void => { profileEditOpen = open; };

// ---------------------------------------------------------------------------
// Modal HTML
// ---------------------------------------------------------------------------

export const profileEditModalHtml = (state: Pick<ClientState, "meName" | "me" | "playerColors">): string => {
  const currentColor = state.playerColors.get(state.me) ?? "#38b000";
  return `
  <div class="profile-edit-backdrop" data-profile-edit-backdrop></div>
  <div class="profile-edit-modal card" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
    <div class="auth-onboarding-head">
      <div id="profile-edit-title" class="auth-panel-title">Update your empire</div>
      <div class="auth-panel-subtitle">Change the name and colour other empires see. Limited to once per season.</div>
    </div>
    <input class="auth-style-input" type="text" placeholder="Display name" autocomplete="nickname" maxlength="24" value="${state.meName || ""}" data-profile-edit-name />
    <div class="auth-color-block">
      <div class="auth-color-label">Nation color</div>
      <div class="auth-color-presets">
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
        <button type="button" class="auth-color-swatch" data-profile-edit-swatch></button>
      </div>
      <label class="auth-color-custom">
        <span>Custom</span>
        <input type="color" value="${currentColor}" data-profile-edit-color />
      </label>
    </div>
    <div class="profile-edit-actions">
      <button type="button" class="panel-btn" data-profile-edit-cancel>Cancel</button>
      <button type="button" class="panel-btn" data-profile-edit-save>Save Changes</button>
    </div>
  </div>
`;
};

// ---------------------------------------------------------------------------
// Modal bindings
// ---------------------------------------------------------------------------

export const bindProfileEditModal = (args: {
  state: Pick<ClientState, "meName" | "me" | "playerColors" | "suggestedColors">;
  overlayEl: HTMLElement;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  updateFirebaseDisplayName: (name: string) => Promise<void>;
  setPendingDisplayNameChange: (name: string) => void;
  setPendingColorChange: (color: string) => void;
  onClose: () => void;
}): void => {
  const {
    state,
    overlayEl,
    sendGameMessage,
    pushFeed,
    updateFirebaseDisplayName,
    setPendingDisplayNameChange,
    setPendingColorChange,
    onClose
  } = args;

  const nameInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-name]");
  const colorInput = overlayEl.querySelector<HTMLInputElement>("[data-profile-edit-color]");
  const swatchButtons = overlayEl.querySelectorAll<HTMLButtonElement>("[data-profile-edit-swatch]");
  const backdrop = overlayEl.querySelector<HTMLDivElement>("[data-profile-edit-backdrop]");
  const cancelBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-cancel]");
  const saveBtn = overlayEl.querySelector<HTMLButtonElement>("[data-profile-edit-save]");
  if (!nameInput || !colorInput || !saveBtn) return;

  const syncSwatches = (): void => syncColorSwatchButtons(swatchButtons, state.suggestedColors, colorInput.value);
  syncSwatches();

  swatchButtons.forEach((btn) => {
    btn.onclick = (): void => {
      const color = btn.dataset.color;
      if (!color) return;
      colorInput.value = color;
      syncSwatches();
    };
  });
  colorInput.oninput = syncSwatches;

  const close = (): void => {
    setProfileEditOpen(false);
    overlayEl.innerHTML = "";
    onClose();
  };
  if (backdrop) backdrop.onclick = close;
  if (cancelBtn) cancelBtn.onclick = close;

  saveBtn.onclick = async (): Promise<void> => {
    const currentColor = state.playerColors.get(state.me) ?? "#38b000";
    const newName = nameInput.value.trim();
    const newColor = colorInput.value.trim();
    if (newName.length < 2) {
      pushFeed("Display name must be at least 2 characters.", "error", "warn");
      return;
    }
    const nameChanged = newName !== state.meName;
    const colorChanged = newColor !== currentColor;
    if (!nameChanged && !colorChanged) {
      pushFeed("No changes to save.", "info", "info");
      return;
    }
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const confirmed = window.confirm(
        "Change your empire's name and/or colour? You can only change your name and colour once per season."
      );
      if (!confirmed) return;
    }
    // Neither update function reports success/failure back to its caller
    // (the server confirms asynchronously via PLAYER_UPDATE), so track
    // whether the synchronous send itself failed (e.g. connection not
    // ready) to avoid closing the modal as if the save had gone through.
    let sendFailed = false;
    const trackedSendGameMessage = (payload: unknown, message?: string): boolean => {
      const sent = sendGameMessage(payload, message);
      if (!sent) sendFailed = true;
      return sent;
    };
    // Each call forwards the OTHER field's *target* value (not its stale
    // current value) so a combined rename+recolour can't have the second
    // SET_PROFILE revert the first — SET_PROFILE always applies both fields
    // verbatim rather than diffing against what the server already has.
    if (nameChanged) {
      await updateSettingsDisplayName(newName, {
        currentName: state.meName,
        currentColor: newColor,
        sendGameMessage: trackedSendGameMessage,
        updateFirebaseDisplayName,
        pushFeed,
        setPendingDisplayNameChange
      });
    }
    if (colorChanged) {
      await updateSettingsColor(newColor, {
        currentName: newName,
        currentColor,
        sendGameMessage: trackedSendGameMessage,
        pushFeed,
        setPendingColorChange
      });
    }
    if (!sendFailed) close();
  };
};

// ---------------------------------------------------------------------------
// Overlay lifecycle (mirrors client-bug-report-hud.ts's renderBugReportOverlay)
// ---------------------------------------------------------------------------

const OVERLAY_ID = "profile-edit-overlay";

export const renderProfileEditOverlay = (args: {
  state: Pick<ClientState, "meName" | "me" | "playerColors" | "suggestedColors" | "pendingDisplayNameChange" | "pendingColorChange">;
  dom: { hud: HTMLElement };
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  pushFeed: (message: string, type: FeedType, severity?: FeedSeverity) => void;
  firebaseAuth: Auth | null | undefined;
  renderHud: () => void;
}): void => {
  const { state, dom, sendGameMessage, pushFeed, firebaseAuth, renderHud } = args;

  const triggerButtons = dom.hud.querySelectorAll<HTMLButtonElement>("[data-settings-edit-profile]");
  triggerButtons.forEach((btn) => {
    btn.onclick = (): void => {
      setProfileEditOpen(true);
      renderHud();
    };
  });

  let overlayEl = dom.hud.querySelector<HTMLDivElement>(`#${OVERLAY_ID}`);
  if (isProfileEditOpen()) {
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.id = OVERLAY_ID;
      overlayEl.style.cssText = "display:grid;position:fixed;inset:0;z-index:9000;place-items:center;";
      dom.hud.appendChild(overlayEl);
    }
    overlayEl.style.display = "grid";
    if (!overlayEl.innerHTML) {
      overlayEl.innerHTML = profileEditModalHtml(state);
      bindProfileEditModal({
        state,
        overlayEl,
        sendGameMessage,
        pushFeed,
        updateFirebaseDisplayName: (name) => updateFirebaseDisplayNameBestEffort(firebaseAuth, name),
        setPendingDisplayNameChange: (name) => { state.pendingDisplayNameChange = name; },
        setPendingColorChange: (color) => { state.pendingColorChange = color; },
        onClose: renderHud
      });
    }
  } else if (overlayEl) {
    overlayEl.style.display = "none";
    overlayEl.innerHTML = "";
  }
};
