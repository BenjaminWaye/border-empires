// "Share profile" on your own in-game profile (docs/gdd.md §7). Asks the
// gateway for this account's public profile link (POST /hq/public-profile/link,
// which creates it on first use) and hands /house.html?h=<public id> to the
// system share sheet and copies it; the link stays on the profile. The public id is random: the link never
// carries the player id.
import { Capacitor } from "@capacitor/core";

import { openGuestSavePanel } from "../client-guest-save/client-guest-save-panel.js";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import {
  publicProfileSharePending,
  publicProfileShareView,
  rememberPublicProfileLink,
  rememberPublicProfileShareState,
  setPublicProfileSharePending,
  showPublicProfileShareNote,
  type PublicProfileShareDeps,
  type PublicProfileShareView
} from "./client-public-house-share-state.js";

export type { PublicProfileShareDeps } from "./client-public-house-share-state.js";

let installedDeps: PublicProfileShareDeps | undefined;

/** Your own profile's sharing buttons, for the HUD render. */
export const ownPublicProfileShareView = (nowMs = Date.now()): PublicProfileShareView => publicProfileShareView(installedDeps, nowMs);

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

export const PUBLIC_PROFILE_LINK_COPIED = "Link copied";

/**
 * Resolves the note to show afterwards. Playtest 2026-11-27: tapping Share
 * showed nothing but a new "Stop sharing" button -- a dismissed share sheet,
 * or a blocked window.prompt, left no trace of the link. The link is now kept
 * on the profile (rememberPublicProfileLink) and copied first, then the share
 * sheet opens where there is one; the note says what happened.
 */
export const sharePublicProfile = async (deps: PublicProfileShareDeps, nav: ShareNavigator = navigator): Promise<string> => {
  const link = await requestPublicProfileLink(deps);
  if (!link.ok) return publicProfileShareFailureLabel(link.error);
  rememberPublicProfileShareState(deps, "on");
  const url = publicHouseUrl(link.publicId);
  rememberPublicProfileLink(deps, url);
  let copied = false;
  try {
    if (nav.clipboard) {
      await nav.clipboard.writeText(url);
      copied = true;
    }
  } catch {
    copied = false;
  }
  if (nav.share) {
    try {
      await nav.share({ title: "My House in Border Empires", url });
      return copied ? PUBLIC_PROFILE_LINK_COPIED : "Shared";
    } catch {
      // Dismissed or refused: the link is still on screen (and copied, when it could be).
    }
  }
  return copied ? PUBLIC_PROFILE_LINK_COPIED : "Copy link below";
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
    rememberPublicProfileShareState(deps, "off");
    rememberPublicProfileLink(deps, undefined);
    return "Sharing stopped";
  } catch {
    return "Couldn't stop sharing. Try again";
  }
};

/** One document-level listener: the profile is re-rendered as HTML, so the buttons themselves are not stable. Progress and outcome go through the share state, which the render reads. */
export const installPublicProfileShare = (deps: PublicProfileShareDeps): void => {
  installedDeps = deps;
  if (typeof document === "undefined") return;
  const run = (kind: "share" | "stop", failed: string, action: () => Promise<string>): void => {
    setPublicProfileSharePending(kind);
    showPublicProfileShareNote(undefined);
    void action()
      .then((label) => showPublicProfileShareNote(label === PUBLIC_PROFILE_SHARE_LABEL ? undefined : label), () => showPublicProfileShareNote(failed))
      .finally(() => setPublicProfileSharePending(undefined));
  };
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-v2-profile-save-to-share]")) { openGuestSavePanel("share"); return; }
    if (publicProfileSharePending()) return;
    if (event.target.closest("[data-v2-profile-share]")) run("share", "Couldn't make the link. Try again", () => sharePublicProfile(deps));
    else if (event.target.closest("[data-v2-profile-unshare]")) run("stop", "Couldn't stop sharing. Try again", () => stopSharingPublicProfile(deps));
  });
};
