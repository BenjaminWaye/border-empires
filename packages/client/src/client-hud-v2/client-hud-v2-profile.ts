// Player profile as a frame screen, like the Manifest or Ranks. The legacy
// profile overlay keeps rendering and fetching its own data (it is written
// through a held element reference, not looked up by id), so while the
// screen is open the element is moved into the frame body and restyled; it
// goes back where it came from when the screen closes.

const OVERLAY_ID = "player-profile-overlay";
const BODY_ID = "v2s-body";

let home: { parent: Node; next: Node | null } | undefined;

export const hostProfileOverlay = (): void => {
  const overlay = document.getElementById(OVERLAY_ID);
  const body = document.getElementById(BODY_ID);
  if (!overlay || !body || overlay.parentNode === body || !overlay.parentNode) return;
  if (!home) home = { parent: overlay.parentNode, next: overlay.nextSibling };
  body.replaceChildren(overlay);
};

export const unhostProfileOverlay = (): void => {
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay && home) {
    const next = home.next && home.next.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(overlay, next);
  }
  home = undefined;
};

/** Which way the profile screen should move this frame: open for a newly picked player, close once it was dismissed. */
export const profileScreenStep = (activeProfileId: string | undefined, screenId: string | null): "open" | "close" | "stay" => {
  if (activeProfileId && screenId !== "profile") return "open";
  if (!activeProfileId && screenId === "profile") return "close";
  return "stay";
};
