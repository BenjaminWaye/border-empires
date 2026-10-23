import {
  EmailAuthProvider, GoogleAuthProvider, OAuthProvider, reauthenticateWithCredential,
  reauthenticateWithPopup, signOut, type Auth, type User
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";

export interface DeletionReceipt { requestId: string; completeBy: number; status: "pending" | "completed" }
class DeletionAuthenticationError extends Error {}
export const deletionEndpoint = (wsUrl: string): string => {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/account/deletion";
  url.search = "";
  url.hash = "";
  return url.href;
};

const postDeletion = async (url: string, token: string): Promise<Response> => {
  // AbortSignal.timeout is unavailable on some supported iOS 15 versions.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirmation: "DELETE" }), signal: controller.signal
    });
  } finally { clearTimeout(timeout); }
};

export const requestAccountDeletion = async (user: Pick<User, "getIdToken">, wsUrl: string, retryToken?: string): Promise<DeletionReceipt> => {
  const response = await postDeletion(deletionEndpoint(wsUrl), retryToken ?? await user.getIdToken(true));
  if (!response.ok) {
    if (response.status === 401) throw new DeletionAuthenticationError("Sign in again to confirm ownership, then retry deletion.");
    throw new Error("Deletion could not be confirmed. Please retry; keep this window open if your login has already been removed.");
  }
  const data: unknown = await response.json();
  if (typeof data !== "object" || !data || !("request" in data) || typeof data.request !== "object" || !data.request) throw new Error("Invalid deletion response. Please retry.");
  const receipt = data.request;
  if (!("requestId" in receipt) || typeof receipt.requestId !== "string" || !("completeBy" in receipt) || typeof receipt.completeBy !== "number" ||
      !("status" in receipt) || (receipt.status !== "pending" && receipt.status !== "completed")) throw new Error("Deletion was not confirmed. Please retry.");
  return { requestId: receipt.requestId, completeBy: receipt.completeBy, status: receipt.status };
};

const confirmOwnership = async (user: User, password: string): Promise<void> => {
  if (user.isAnonymous) return;
  if (user.email && user.providerData.some((provider) => provider.providerId === "password")) {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }
  const provider = user.providerData.find((entry) => ["google.com", "oidc.twitch", "oidc.discord"].includes(entry.providerId));
  if (!provider || Capacitor.isNativePlatform()) throw new Error("Sign in with this account on the website to delete it.");
  await reauthenticateWithPopup(user, provider.providerId === "google.com" ? new GoogleAuthProvider() : new OAuthProvider(provider.providerId));
};

export const openAccountDeletion = (auth: Auth, wsUrl: string): void => {
  if (document.querySelector("[data-account-deletion-dialog]")) return;
  const user = auth.currentUser;
  if (!user) return;
  const needsPassword = !user.isAnonymous && user.providerData.some((provider) => provider.providerId === "password");
  const dialog = document.createElement("dialog");
  dialog.dataset.accountDeletionDialog = "true";
  dialog.className = "account-deletion-dialog";
  dialog.setAttribute("aria-labelledby", "account-deletion-title");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("role", "dialog");
  dialog.innerHTML = `<form>
    <h2 id="account-deletion-title">Delete your account</h2>
    <p>This permanently removes your Border Empires login. Your profile, linked game data and social data will be deleted or anonymised within 30 days. You cannot recover your empire.</p>
    <p>Shared match outcomes may remain anonymously. Backup copies expire within 30 days after completion. No purchase or subscription is attached to this game account.</p>
    ${needsPassword ? '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>' : ""}
    <label>Type DELETE to confirm<input name="confirmation" autocomplete="off" required pattern="DELETE"></label>
    <p role="status" aria-live="polite"></p>
    <div class="account-deletion-actions"><button type="button" class="panel-btn" data-cancel>Cancel</button><button type="submit" class="panel-btn account-deletion-confirm">Delete account</button></div>
  </form>`;
  const form = dialog.querySelector<HTMLFormElement>("form")!;
  const status = dialog.querySelector<HTMLElement>('[role="status"]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>("[data-cancel]")!;
  const submit = dialog.querySelector<HTMLButtonElement>('[type="submit"]')!;
  let submitting = false;
  // Preserve only in this dialog's memory: Firebase may have deleted the user
  // before a lost response. Retrying with the original signed token is safe.
  let retryToken: string | undefined;
  let fallback: HTMLDivElement | undefined;
  const close = (): void => {
    if (submitting) return;
    if (typeof dialog.close === "function") dialog.close();
    dialog.remove();
    fallback?.remove();
  };
  cancel.onclick = close;
  dialog.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    submit.disabled = true;
    cancel.disabled = true;
    status.textContent = "Confirming ownership and submitting deletion…";
    try {
      const password = form.querySelector<HTMLInputElement>('[name="password"]')?.value ?? "";
      if (!retryToken) {
        await confirmOwnership(user, password);
        retryToken = await user.getIdToken(true);
      }
      const receipt = await requestAccountDeletion(user, wsUrl, retryToken);
      const passwordInput = form.querySelector<HTMLInputElement>('[name="password"]');
      if (passwordInput) passwordInput.value = "";
      form.querySelectorAll("input").forEach((input) => { input.disabled = true; });
      submit.hidden = true;
      status.textContent = `Your login has been deleted. Associated data deletion is scheduled by ${new Date(receipt.completeBy).toLocaleDateString()}. Reference: ${receipt.requestId}. Save this reference if you need support.`;
      await signOut(auth).catch(() => {});
      cancel.textContent = "Close";
    } catch (error) {
      if (error instanceof DeletionAuthenticationError) retryToken = undefined;
      status.textContent = error instanceof Error && !error.message.startsWith("Firebase:") ? error.message : "Could not verify ownership. Check your password or sign-in method and try again.";
      submit.disabled = false;
    } finally {
      submitting = false;
      cancel.disabled = false;
    }
  };
  document.body.append(dialog);
  if (typeof dialog.showModal === "function") dialog.showModal();
  else {
    // iOS 15.0–15.3 predate the native dialog API; keep deletion available on
    // every supported OS rather than failing when the button is pressed.
    fallback = document.createElement("div");
    fallback.className = "account-deletion-backdrop";
    fallback.append(dialog);
    document.body.append(fallback);
    dialog.setAttribute("open", "");
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>("input:not(:disabled), button:not(:disabled):not([hidden])"));
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
      else if (!event.shiftKey && current === controls.length - 1) { event.preventDefault(); controls[0]?.focus(); }
    });
    dialog.querySelector<HTMLElement>("input, button")?.focus();
  }
};
