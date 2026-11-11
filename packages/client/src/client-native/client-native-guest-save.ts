import { Capacitor } from "@capacitor/core";
import { EmailAuthProvider, getAuth, linkWithCredential, type User } from "firebase/auth";
import type { NativeSsoMethod } from "../client-native-sso/client-native-sso.js";

const currentGuest = async (): Promise<User> => {
  const auth = getAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user?.isAnonymous) throw new Error("This guest session is no longer available.");
  return user;
};

const refreshAfterLink = async (user: User): Promise<void> => {
  try {
    await user.getIdToken(true);
  } catch {
    // Linking has already saved the account. Reload will retry token refresh;
    // do not leave a now-saved user stranded on the guest form.
  }
};

// Twitch/Discord are not offered here: their native flow has no credential-only
// mode, so it would create a separate account before the guest could be linked.
export type NativeGuestSaveProvider = Extract<NativeSsoMethod, "google.com" | "apple.com">;

/** Link a Google/Apple identity to the guest UID so saving never replaces its empire. */
export const saveNativeGuestWithProvider = async (method: NativeGuestSaveProvider): Promise<void> => {
  const user = await currentGuest();
  const { linkWithNativeSso } = await import("../client-native-sso/client-native-sso.js");
  await linkWithNativeSso(user, method);
  await refreshAfterLink(user);
};

const CONFLICT_CODES = new Set(["auth/email-already-in-use", "auth/credential-already-in-use", "auth/account-exists-with-different-credential"]);

export const nativeGuestSaveErrorMessage = (error: unknown, label: string): string => {
  const code = error instanceof Object && "code" in error ? error.code : undefined;
  if (typeof code === "string" && CONFLICT_CODES.has(code)) {
    return `That ${label} already has an account. Use a different one to keep this guest empire.`;
  }
  return error instanceof Error ? error.message : "Could not save. Check your connection and try again.";
};

/** Link credentials to the guest UID so saving never replaces its empire. */
export const saveNativeGuest = async (email: string, password: string): Promise<void> => {
  const user = await currentGuest();
  await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
  await refreshAfterLink(user);
};

const providerButton = (label: string, method: NativeGuestSaveProvider, status: HTMLElement, beginSave: () => boolean, endSave: () => void): HTMLButtonElement => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `panel-btn guest-save-btn ${method === "apple.com" ? "guest-save-apple" : "guest-save-primary"}`;
  button.textContent = `Continue with ${label}`;
  button.onclick = async () => {
    if (!beginSave()) return;
    status.textContent = `Opening ${label}...`;
    try {
      await saveNativeGuestWithProvider(method);
      window.location.reload();
    } catch (error) {
      const cancelled = error instanceof Error && error.name === "NativeSsoCancelledError";
      status.textContent = cancelled ? "" : nativeGuestSaveErrorMessage(error, `${label} account`);
      endSave();
    }
  };
  return button;
};

let saveInFlight = false;
let enableReopenedControls: (() => void) | undefined;

export const nativeGuestSaveOptions = (): HTMLElement[] => {
  const form = document.createElement("form");
  form.className = "native-guest-save";
  const email = document.createElement("input");
  email.type = "email";
  email.autocomplete = "email";
  email.placeholder = "Email address";
  email.setAttribute("aria-label", "Email address");
  email.required = true;
  const password = document.createElement("input");
  password.type = "password";
  password.autocomplete = "new-password";
  password.placeholder = "Create a password";
  password.setAttribute("aria-label", "Create a password");
  password.minLength = 6;
  password.required = true;
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "panel-btn guest-save-btn";
  save.textContent = "Save with email and password";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  form.append(email, password, save, status);
  const setSaving = (saving: boolean): void => {
    save.disabled = saving;
    providers.forEach((button) => { button.disabled = saving; });
  };
  const beginSave = (): boolean => {
    if (saveInFlight) return false;
    saveInFlight = true;
    setSaving(true);
    return true;
  };
  const endSave = (): void => {
    saveInFlight = false;
    setSaving(false);
    enableReopenedControls?.();
    enableReopenedControls = undefined;
  };
  const providers = [providerButton("Google", "google.com", status, beginSave, endSave)];
  if (Capacitor.getPlatform() === "ios") providers.unshift(providerButton("Apple", "apple.com", status, beginSave, endSave));
  const wrapper = document.createElement("div");
  wrapper.className = "native-guest-save-options";
  const or = document.createElement("div");
  or.className = "guest-save-or";
  or.textContent = "or";
  wrapper.append(...providers, or, form);
  if (saveInFlight) {
    setSaving(true);
    enableReopenedControls = () => setSaving(false);
  }
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || !beginSave()) return;
    try {
      await saveNativeGuest(email.value, password.value);
      window.location.reload();
    } catch (error) {
      status.textContent = nativeGuestSaveErrorMessage(error, "email");
      endSave();
    }
  };
  return [wrapper];
};
