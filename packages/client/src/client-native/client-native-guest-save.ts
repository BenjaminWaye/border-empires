import { EmailAuthProvider, getAuth, linkWithCredential } from "firebase/auth";

/** Link credentials to the guest UID so saving never replaces its empire. */
export const saveNativeGuest = async (email: string, password: string): Promise<void> => {
  const auth = getAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user?.isAnonymous) throw new Error("This guest session is no longer available.");
  await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
  try {
    await user.getIdToken(true);
  } catch {
    // Linking has already saved the account. Reload will retry token refresh;
    // do not leave a now-saved user stranded on the guest form.
  }
};

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
  save.className = "panel-btn guest-save-btn guest-save-primary";
  save.textContent = "Save with email and password";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  form.append(email, password, save, status);
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!form.reportValidity() || save.disabled) return;
    save.disabled = true;
    try {
      await saveNativeGuest(email.value, password.value);
      window.location.reload();
    } catch (error) {
      const code = error instanceof Object && "code" in error ? error.code : undefined;
      status.textContent = code === "auth/email-already-in-use" || code === "auth/credential-already-in-use"
        ? "That email already has an account. Use a different email to keep this guest empire."
        : error instanceof Error ? error.message : "Could not save. Check your connection and try again.";
      save.disabled = false;
    }
  };
  return [form];
};
