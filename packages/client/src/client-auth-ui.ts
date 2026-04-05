import type { User } from "firebase/auth";
import type { ClientState } from "./client-state.js";

export const setAuthStatus = (
  state: Pick<ClientState, "authError">,
  authStatusEl: HTMLElement,
  message: string,
  tone: "normal" | "error" = "normal"
): void => {
  state.authError = tone === "error" ? message : "";
  authStatusEl.textContent = message;
  authStatusEl.dataset.tone = tone;
};

export const syncAuthPanelState = (
  state: Pick<ClientState, "profileSetupRequired">,
  deps: {
    authEmailLinkSentTo: string;
    authPanelEl: HTMLElement;
    authEmailSentAddressEl: HTMLElement;
    authProfileColorEl: HTMLInputElement;
    authColorPresetButtons: NodeListOf<HTMLButtonElement>;
  }
): void => {
  deps.authPanelEl.dataset.mode = state.profileSetupRequired ? "setup" : deps.authEmailLinkSentTo ? "sent" : "login";
  deps.authEmailSentAddressEl.textContent = deps.authEmailLinkSentTo;
  const activeColor = deps.authProfileColorEl.value.toLowerCase();
  deps.authColorPresetButtons.forEach((btn) => {
    btn.dataset.selected = btn.dataset.color?.toLowerCase() === activeColor ? "true" : "false";
  });
};

export const syncAuthOverlay = (
  state: Pick<ClientState, "authSessionReady" | "profileSetupRequired" | "authBusy" | "authConfigured" | "authError" | "authReady" | "authBusyTitle" | "authBusyDetail">,
  deps: {
    authOverlayEl: HTMLElement;
    authBusyModalEl: HTMLElement;
    authLoginBtn: HTMLButtonElement;
    authRegisterBtn: HTMLButtonElement;
    authEmailLinkBtn: HTMLButtonElement;
    authGoogleBtn: HTMLButtonElement;
    authEmailEl: HTMLInputElement;
    authPasswordEl: HTMLInputElement;
    authDisplayNameEl: HTMLInputElement;
    authEmailResetBtn: HTMLButtonElement;
    authProfileNameEl: HTMLInputElement;
    authProfileColorEl: HTMLInputElement;
    authProfileSaveBtn: HTMLButtonElement;
    authBusyTitleEl: HTMLElement;
    authBusyCopyEl: HTMLElement;
    authStatusEl: HTMLElement;
    syncAuthPanelState: () => void;
    setAuthStatus: (message: string, tone?: "normal" | "error") => void;
  }
): void => {
  deps.authOverlayEl.style.display = state.authSessionReady && !state.profileSetupRequired ? "none" : "grid";
  deps.authOverlayEl.dataset.busy = state.authBusy ? "true" : "false";
  deps.authBusyModalEl.setAttribute("aria-hidden", state.authBusy ? "false" : "true");
  deps.authLoginBtn.disabled = state.authBusy || !state.authConfigured;
  deps.authRegisterBtn.disabled = state.authBusy || !state.authConfigured;
  deps.authEmailLinkBtn.disabled = state.authBusy || !state.authConfigured;
  deps.authGoogleBtn.disabled = state.authBusy || !state.authConfigured;
  deps.authEmailEl.disabled = state.authBusy || !state.authConfigured;
  deps.authPasswordEl.disabled = state.authBusy || !state.authConfigured;
  deps.authDisplayNameEl.disabled = state.authBusy || !state.authConfigured;
  deps.authEmailResetBtn.disabled = state.authBusy;
  deps.authProfileNameEl.disabled = state.authBusy || !state.authConfigured;
  deps.authProfileColorEl.disabled = state.authBusy || !state.authConfigured;
  deps.authProfileSaveBtn.disabled = state.authBusy || !state.authConfigured;
  deps.authBusyTitleEl.textContent = state.authBusyTitle || (state.profileSetupRequired ? "Preparing your banner..." : "Connecting your empire...");
  deps.authBusyCopyEl.textContent = state.authError
    ? state.authError
    : state.authBusyDetail || deps.authStatusEl.textContent?.trim() || "Please wait while we finish sign-in and sync your starting state.";
  deps.syncAuthPanelState();
  if (!state.authConfigured) {
    deps.setAuthStatus("Firebase auth is not configured. Set the VITE_FIREBASE_* env vars.", "error");
  } else if (state.profileSetupRequired && !state.authBusy && !state.authError) {
    deps.setAuthStatus("One last step before the campaign begins.");
  } else if (!state.authReady && !state.authBusy && !state.authError) {
    deps.setAuthStatus("");
  }
};

export const authLabelForUser = (user: User): string => user.displayName?.trim() || user.email?.trim() || "Authenticated user";

export const seedProfileSetupFields = (
  deps: {
    authProfileNameEl: HTMLInputElement;
    authProfileColorEl: HTMLInputElement;
    syncAuthPanelState: () => void;
  },
  name?: string,
  color?: string
): void => {
  const cleanedName = (name ?? "").trim();
  if (cleanedName) deps.authProfileNameEl.value = cleanedName.slice(0, 24);
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) deps.authProfileColorEl.value = color;
  deps.syncAuthPanelState();
};
