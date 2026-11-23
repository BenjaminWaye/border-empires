// "Share profile" on your own in-game profile (docs/gdd.md §7). Asks the
// gateway for this account's public profile link (POST /hq/public-profile/link,
// which creates it on first use) and hands /house.html?h=<public id> to the
// system share sheet, or copies it. The public id is random: the link never
// carries the player id.
import { Capacitor } from "@capacitor/core";

import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";

export type PublicProfileShareDeps = {
  wsUrl: string;
  getIdToken: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
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

/** One document-level listener: the profile is re-rendered as HTML, so the button itself is not stable. */
export const installPublicProfileShare = (deps: PublicProfileShareDeps): void => {
  if (typeof document === "undefined") return;
  let busy = false;
  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-v2-profile-share]") : null;
    if (!button || busy) return;
    busy = true;
    button.textContent = "Making link…";
    void sharePublicProfile(deps).then((label) => {
      busy = false;
      // The profile may have been re-rendered meanwhile; label whichever button is on screen.
      const current = document.querySelector<HTMLButtonElement>("[data-v2-profile-share]");
      if (current) current.textContent = label;
    });
  });
};
