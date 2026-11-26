// "Share profile" on your own in-game profile (docs/gdd.md §7). Asks the
// gateway for this account's public profile link (POST /hq/public-profile/link,
// which creates it on first use) and hands /house.html?h=<public id> to the
// system share sheet, or copies it. The public id is random: the link never
// carries the player id.
import { Capacitor } from "@capacitor/core";

import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";

export type PublicProfileShareDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  /** Who is signed in; the cached sharing state belongs to one account. */
  accountKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
};

/** Whether this account has a live public link; "unknown" until the gateway answers. */
export type PublicProfileShareState = "unknown" | "on" | "off";

let knownShareState: { account: string; state: "on" | "off" } | undefined;
let shareStateRequest: Promise<void> | undefined;
let shareStateFailedAt = 0;
let installedDeps: PublicProfileShareDeps | undefined;
const SHARE_STATE_RETRY_MS = 30_000;

const accountOf = (deps: PublicProfileShareDeps): string => deps.accountKey?.() ?? "";
const rememberShareState = (deps: PublicProfileShareDeps, state: "on" | "off"): void => {
  knownShareState = { account: accountOf(deps), state };
};

/** GET /hq/public-profile/link: whether the caller already has a link. undefined when it can't tell. */
export const requestPublicProfileShareState = async (deps: PublicProfileShareDeps): Promise<"on" | "off" | undefined> => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const token = await deps.getIdToken();
    if (!token) return undefined;
    const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/hq/public-profile/link`, { method: "GET", headers: { authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => undefined)) as { ok?: unknown; publicId?: unknown } | undefined;
    if (body?.ok !== true) return undefined;
    return typeof body.publicId === "string" ? "on" : "off";
  } catch {
    return undefined;
  }
};

/** Read on every profile render: answers from cache and asks the gateway (once at a time) when the account's state is not known yet. */
export const publicProfileShareState = (deps: PublicProfileShareDeps | undefined = installedDeps, nowMs = Date.now()): PublicProfileShareState => {
  if (!deps) return "unknown";
  const account = accountOf(deps);
  if (knownShareState?.account === account) return knownShareState.state;
  if (!shareStateRequest && nowMs - shareStateFailedAt >= SHARE_STATE_RETRY_MS) {
    shareStateRequest = requestPublicProfileShareState(deps)
      .then((state) => {
        if (state) knownShareState = { account, state };
        else shareStateFailedAt = Date.now();
      })
      .finally(() => { shareStateRequest = undefined; });
  }
  return "unknown";
};

/** Tests only. */
export const resetPublicProfileShareState = (): void => {
  knownShareState = undefined;
  shareStateRequest = undefined;
  shareStateFailedAt = 0;
  installedDeps = undefined;
};

export type PublicProfileLinkResult = { ok: true; publicId: string } | { ok: false; error: "signed_out" | "account_required" | "unavailable" };

export const publicHouseUrl = (
  publicId: string,
  locationLike: Pick<Location, "origin"> | undefined = typeof window !== "undefined" ? window.location : undefined
): string => {
  const native = Capacitor.isNativePlatform();
  const configured = (import.meta.env.VITE_NATIVE_PUBLIC_ORIGIN as string | undefined)?.trim().replace(/\/$/, "");
  const origin = native ? configured || "https://play.borderempires.com" : locationLike?.origin.replace(/\/$/, "");
  return `${origin && origin !== "null" ? origin : "https://play.borderempires.com"}/house.html?h=${encodeURIComponent(publicId)}`;
};

export const requestPublicProfileLink = async (deps: PublicProfileShareDeps): Promise<PublicProfileLinkResult> => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const token = await deps.getIdToken();
    if (!token) return { ok: false, error: "signed_out" };
    const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/hq/public-profile/link`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => undefined)) as { ok?: unknown; publicId?: unknown; error?: unknown } | undefined;
    if (body?.ok === true && typeof body.publicId === "string") return { ok: true, publicId: body.publicId };
    return { ok: false, error: body?.error === "account_required" ? "account_required" : "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
};

export const PUBLIC_PROFILE_SHARE_LABEL = "Share profile";

export const publicProfileShareFailureLabel = (error: Exclude<PublicProfileLinkResult, { ok: true }>["error"]): string =>
  error === "account_required" ? "Save your account to share" : error === "signed_out" ? "Sign in to share" : "Couldn't make the link. Try again";

type ShareNavigator = { share?: (data: { title: string; url: string }) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } };

/** Resolves the label the button should show afterwards. */
export const sharePublicProfile = async (deps: PublicProfileShareDeps, nav: ShareNavigator = navigator): Promise<string> => {
  const link = await requestPublicProfileLink(deps);
  if (!link.ok) return publicProfileShareFailureLabel(link.error);
  rememberShareState(deps, "on");
  const url = publicHouseUrl(link.publicId);
  if (nav.share) {
    try {
      await nav.share({ title: "My House in Border Empires", url });
      return PUBLIC_PROFILE_SHARE_LABEL;
    } catch (error) {
      // Dismissing the share sheet is not a failure; anything else falls back to copying.
      if (error instanceof Error && error.name === "AbortError") return PUBLIC_PROFILE_SHARE_LABEL;
    }
  }
  try {
    if (!nav.clipboard) throw new Error("no clipboard");
    await nav.clipboard.writeText(url);
    return "Link copied";
  } catch {
    window.prompt("Copy your House profile link", url);
    return PUBLIC_PROFILE_SHARE_LABEL;
  }
};

export const PUBLIC_PROFILE_STOP_LABEL = "Stop sharing";

/** Removes this account's public link (DELETE /hq/public-profile/link): the page stops working at once. Resolves the button label. */
export const stopSharingPublicProfile = async (deps: PublicProfileShareDeps): Promise<string> => {
  const fetchImpl = deps.fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  try {
    const token = await deps.getIdToken();
    if (!token) return "Sign in to stop sharing";
    const response = await fetchImpl(`${rallyApiOrigin(deps.wsUrl)}/hq/public-profile/link`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
    const body = (await response.json().catch(() => undefined)) as { ok?: unknown } | undefined;
    if (body?.ok !== true) return "Couldn't stop sharing. Try again";
    rememberShareState(deps, "off");
    return "Sharing stopped";
  } catch {
    return "Couldn't stop sharing. Try again";
  }
};

/** One document-level listener: the profile is re-rendered as HTML, so the buttons themselves are not stable. */
export const installPublicProfileShare = (deps: PublicProfileShareDeps): void => {
  installedDeps = deps;
  if (typeof document === "undefined") return;
  let busy = false;
  const run = (selector: string, pending: string, failed: string, action: () => Promise<string>): void => {
    busy = true;
    const label = (text: string): void => {
      // The profile may have been re-rendered meanwhile; label whichever button is on screen.
      const current = document.querySelector<HTMLButtonElement>(selector);
      if (current) current.textContent = text;
    };
    label(pending);
    void action().then(label, () => label(failed)).finally(() => { busy = false; });
  };
  document.addEventListener("click", (event) => {
    if (busy || !(event.target instanceof Element)) return;
    if (event.target.closest("[data-v2-profile-save-to-share]")) { openGuestSavePanel("badge"); return; }
    if (event.target.closest("[data-v2-profile-share]")) run("[data-v2-profile-share]", "Making link…", "Couldn't make the link. Try again", () => sharePublicProfile(deps));
    else if (event.target.closest("[data-v2-profile-unshare]")) run("[data-v2-profile-unshare]", "Stopping…", "Couldn't stop sharing. Try again", () => stopSharingPublicProfile(deps));
  });
};
