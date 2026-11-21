// After the player keeps their charges (owner 2026-11-21): a one-time note that the charges live in their
// profile from now on, with "Show me", which opens the profile and points at its Manage charges button
// (client-house-charges-profile.ts). Shown once per deal, after the first save the server confirms.

const SEEN_KEY = "be.houseCharges.profileTipSeen";
/** How long Manage charges glows after "Show me". */
export const MANAGE_CHARGES_CALLOUT_MS = 6_000;

/** The deal whose save is waiting to be confirmed (then the tip shows), or showing the tip now. */
let pendingDeal: number | undefined;
let calloutUntil = 0;

const readSeen = (): string | null => {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
};

const writeSeen = (dealtAt: number): void => {
  try {
    window.localStorage.setItem(SEEN_KEY, String(dealtAt));
  } catch {
    // Storage blocked: the tip may show again after a later save, which is harmless.
  }
};

/** The player pressed Keep: once the server confirms, the tip shows (unless already seen for this deal). */
export const noteHouseChargesSaved = (dealtAt: number): void => {
  if (readSeen() !== String(dealtAt)) pendingDeal = dealtAt;
};

/** The save never left (not signed in): no tip, and it can still show after a later save. */
export const forgetHouseChargesSave = (): void => {
  pendingDeal = undefined;
};

/** Whether the tip shows now: a save of this deal is pending and nothing is left unsaved. */
export const houseChargesProfileTipShown = (dealtAt: number, unsaved: boolean): boolean => pendingDeal === dealtAt && !unsaved;

/** The tip is done with (dismissed, Show me, or the panel closed): never shown again for this deal. */
export const dismissHouseChargesProfileTip = (): void => {
  if (pendingDeal !== undefined) writeSeen(pendingDeal);
  pendingDeal = undefined;
};

export const houseChargesProfileTipHtml = (): string =>
  `<div class="house-charges-popover house-charges-tip" role="status">
    <p>Your charges are kept. To see or change them later, open your profile.</p>
    <div class="house-charges-popover-actions">
      <button class="panel-btn" type="button" data-house-charges-tip-show>Show me</button>
      <button class="panel-btn house-charges-popover-close" type="button" data-house-charges-tip-close aria-label="Dismiss">×</button>
    </div>
  </div>`;

/** "Show me": Manage charges in the profile glows for a few seconds. */
export const requestManageChargesCallout = (nowMs: number): void => {
  calloutUntil = nowMs + MANAGE_CHARGES_CALLOUT_MS;
};

export const manageChargesCalloutActive = (nowMs: number): boolean => nowMs < calloutUntil;

/** Brings the glowing Manage charges button into view once the profile screen has drawn it. */
export const scrollManageChargesIntoView = (root: ParentNode, tries = 10): void => {
  const button = root.querySelector<HTMLElement>("[data-v2-open-charges]");
  if (button) {
    button.scrollIntoView({ block: "center", behavior: "smooth" });
    return;
  }
  if (tries > 0) window.setTimeout(() => scrollManageChargesIntoView(root, tries - 1), 120);
};

/** Test-only. */
export const resetHouseChargesProfileTipForTests = (): void => {
  pendingDeal = undefined;
  calloutUntil = 0;
};
