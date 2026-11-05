import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";

export const externalNativeUrl = (href: string, baseUrl: string): string | undefined => {
  const base = new URL(baseUrl);
  const url = new URL(href, base);
  const local = url.protocol === base.protocol && url.host === base.host;
  if (local && ["/privacy.html", "/terms.html", "/support.html", "/delete-account.html"].includes(url.pathname)) {
    return `https://play.borderempires.com${url.pathname}`;
  }
  return ["https:", "http:"].includes(url.protocol) && !local ? url.href : undefined;
};

/** The normal client mounts asynchronously; stop observing once its login UI exists. */
export const configureNativeLogin = (): boolean => {
  const controls = document.querySelector<HTMLElement>(".auth-legacy-controls");
  if (!controls) return false;
  if (controls.dataset.nativeReady) return true;
  controls.dataset.nativeReady = "true";
  controls.hidden = false;
  document.querySelector(".auth-login-state")?.append(controls);
  document.querySelector("#auth-email")?.setAttribute("aria-label", "Email address");
  document.querySelector("#auth-password")?.setAttribute("aria-label", "Password");
  document.querySelector("#auth-display-name")?.setAttribute("aria-label", "Display name for new accounts");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const reset = document.createElement("button");
  reset.type = "button";
  reset.className = "panel-btn";
  reset.textContent = "Reset password";
  reset.onclick = async () => {
    const email = document.querySelector<HTMLInputElement>("#auth-email")?.value.trim();
    if (!email) { status.textContent = "Enter your email first."; return; }
    reset.disabled = true;
    try {
      await sendPasswordResetEmail(getAuth(), email);
      status.textContent = "Check your email for password reset instructions, then return to the app.";
    } catch {
      status.textContent = "Could not send reset instructions. Check your email and connection.";
    } finally { reset.disabled = false; }
  };
  controls.append(reset, status);
  return true;
};

export const installNativeShell = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  document.documentElement.dataset.nativeApp = "true";
  // A contained viewport keeps fixed game controls clear of notches and system bars
  // for both renderers, without changing their coordinate spaces.
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    "content", "width=device-width, initial-scale=1.0, viewport-fit=contain"
  );
  const observer = new MutationObserver(() => {
    if (configureNativeLogin()) observer.disconnect();
  });
  if (!configureNativeLogin()) observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!anchor || anchor.hasAttribute("download")) return;
    const url = externalNativeUrl(anchor.href, window.location.href);
    if (!url) return;
    event.preventDefault();
    void Browser.open({ url }).catch(() => { /* The game stays open if the browser is unavailable. */ });
  }, { capture: true });
  void App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) document.dispatchEvent(new Event("resume"));
  });
};
