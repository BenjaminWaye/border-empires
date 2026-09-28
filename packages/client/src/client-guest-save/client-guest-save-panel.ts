import { safeLocalStorageGet, safeLocalStorageSet } from "../client-safe-storage/client-safe-storage.js";
import type { ClientState } from "../client-state/client-state.js";
import { getGuestSave, type EmailLinkResult, type GuestSaveController, type SaveView } from "./client-guest-save.js";

export type OpenReason = "badge" | "diplomacy" | "nudge";

const BADGE_ID = "guest-save-badge";
const PANEL_ID = "guest-save-panel";
// The unprompted nudge appears once per browser, after this long in the game.
const NUDGE_AFTER_MS = 10 * 60_000;
const NUDGE_STORAGE_KEY = "be_guest_save_nudged";

const INTRO: Record<OpenReason, string> = {
  badge: "You're playing as a guest.",
  diplomacy: "Alliances and truces are for saved empires. You're playing as a guest.",
  nudge: "Enjoying it? Save your empire so you don't lose it."
};

let unsubscribe: (() => void) | undefined;
let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
let openReason: OpenReason = "badge";

const hudRoot = (): HTMLElement => document.getElementById("hud") ?? document.body;
const panelEl = (): HTMLElement | null => document.getElementById(PANEL_ID);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const action = (label: string, name: string, className = "panel-btn guest-save-btn"): HTMLButtonElement => {
  const button = el("button", className, label);
  button.type = "button";
  button.dataset.guestSave = name;
  return button;
};

const benefits = (): HTMLElement => {
  const list = el("ul", "guest-save-benefits");
  for (const text of ["Keep this empire", "Make alliances and truces", "Get season updates by email"]) list.append(el("li", undefined, text));
  return list;
};

const saveOptions = (guestSave: GuestSaveController): HTMLElement[] => {
  const blocked = guestSave.unavailableReason();
  if (blocked) return [el("p", "guest-save-note", blocked), action("Keep playing as a guest", "close")];
  const emailRow = el("div", "guest-save-email-row");
  const input = el("input", "guest-save-email");
  input.type = "email";
  input.placeholder = "your@email.com";
  input.autocomplete = "email";
  input.dataset.guestSave = "email-input";
  emailRow.append(input, action("Email me a link", "email"));
  return [action("Continue with Google", "google", "panel-btn guest-save-btn guest-save-primary"), el("div", "guest-save-or", "or"), emailRow];
};

const renderBody = (view: SaveView, guestSave: GuestSaveController): HTMLElement[] => {
  switch (view.kind) {
    case "busy":
      return [el("p", "guest-save-busy", view.message)];
    case "email-sent": {
      const sent = el("p", "guest-save-note", "We sent a link to ");
      sent.append(el("strong", undefined, view.email), " Open it in this same browser to finish saving your empire.");
      return [el("h3", "guest-save-subtitle", "Check your email"), sent, action("Use a different email", "retry")];
    }
    case "conflict":
      return [
        el("h3", "guest-save-subtitle", `That ${view.method === "google.com" ? "Google account" : "email"} already has an empire`),
        el("p", "guest-save-note", "You can switch to it, but this guest empire will be left behind and can't be recovered."),
        action("Switch to that empire", "switch", "panel-btn guest-save-btn guest-save-primary"),
        action("Keep playing as a guest", "keep")
      ];
    case "error":
      return [el("p", "guest-save-error", view.message), ...saveOptions(guestSave)];
    default:
      return [benefits(), el("p", "guest-save-note", "A guest empire lives only in this browser. Clearing site data or switching browsers loses it."), ...saveOptions(guestSave)];
  }
};

const render = (): void => {
  const panel = panelEl();
  const guestSave = getGuestSave();
  if (!panel || !guestSave) return;
  const typedEmail = (panel.querySelector('[data-guest-save="email-input"]') as HTMLInputElement | null)?.value;
  panel.querySelector('[data-role="intro"]')!.textContent = INTRO[openReason];
  const body = panel.querySelector('[data-role="body"]')!;
  body.replaceChildren(...renderBody(guestSave.getView(), guestSave));
  const input = body.querySelector('[data-guest-save="email-input"]') as HTMLInputElement | null;
  if (input && typedEmail) input.value = typedEmail;
};

export const closeGuestSavePanel = (): void => {
  unsubscribe?.();
  unsubscribe = undefined;
  panelEl()?.remove();
};

const onPanelClick = (event: Event): void => {
  const guestSave = getGuestSave();
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-guest-save]");
  const name = target?.dataset.guestSave;
  if (!guestSave || !name) return;
  if (name === "close") return closeGuestSavePanel();
  if (name === "google") void guestSave.saveWithGoogle();
  else if (name === "email") void guestSave.saveWithEmail((panelEl()?.querySelector('[data-guest-save="email-input"]') as HTMLInputElement | null)?.value ?? "");
  else if (name === "switch") void guestSave.switchToExisting();
  else if (name === "keep") {
    guestSave.keepPlayingAsGuest();
    closeGuestSavePanel();
  } else if (name === "retry") guestSave.keepPlayingAsGuest();
};

export const openGuestSavePanel = (reason: OpenReason = "badge"): void => {
  const guestSave = getGuestSave();
  if (!guestSave) return;
  openReason = reason;
  if (!panelEl()) {
    const panel = el("section", "guest-save-panel");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "guest-save-title");
    const card = el("div", "guest-save-card");
    const title = el("h2", undefined, "Save your empire");
    title.id = "guest-save-title";
    const intro = el("p", "guest-save-intro");
    intro.dataset.role = "intro";
    const body = el("div", "guest-save-body");
    body.dataset.role = "body";
    const close = el("button", "guest-save-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.dataset.guestSave = "close";
    card.append(close, title, intro, body);
    panel.append(card);
    panel.addEventListener("click", onPanelClick);
    hudRoot().append(panel);
    unsubscribe = guestSave.subscribe(render);
  }
  render();
};

// Called when an emailed link is opened in a browser that has a guest session:
// finishes the save, or shows the panel when that email already has an empire.
export const completeGuestEmailLink = async (result: EmailLinkResult, email: string, href: string): Promise<void> => {
  await getGuestSave()?.handleEmailLinkResult(result, email, href);
  if (result.kind === "conflict") openGuestSavePanel("badge");
};

type BadgeState = Pick<ClientState, "authIsGuest" | "authSessionReady" | "needsSeasonJoin">;

const clearNudge = (): void => {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = undefined;
};

// Keeps the badge (and the one-off nudge) in step with whether the signed-in
// player is a guest. Cheap and idempotent: it runs on every HUD render.
export const syncGuestSaveBadge = (state: BadgeState): void => {
  const showBadge = state.authIsGuest && state.authSessionReady && getGuestSave() !== undefined;
  const badge = document.getElementById(BADGE_ID);
  if (!showBadge) {
    badge?.remove();
    clearNudge();
    // Only once a real session exists: while an emailed link is still being completed at page load the guest flag may not be set yet, and the conflict prompt must survive that.
    if (panelEl() && !state.authIsGuest && state.authSessionReady) closeGuestSavePanel();
    return;
  }
  if (!badge) {
    const created = el("button", "panel-btn guest-save-badge");
    // The short label is what fits between the Center button and the minimap on a phone.
    created.append(el("span", "guest-save-badge-long", "Guest · Save your empire"), el("span", "guest-save-badge-short", "Save empire"));
    created.setAttribute("aria-label", "Guest: save your empire");
    created.id = BADGE_ID;
    created.type = "button";
    created.addEventListener("click", () => openGuestSavePanel("badge"));
    hudRoot().append(created);
  }
  const playing = !state.needsSeasonJoin;
  if (playing && !nudgeTimer && safeLocalStorageGet(NUDGE_STORAGE_KEY) !== "1") {
    nudgeTimer = setTimeout(() => {
      nudgeTimer = undefined;
      if (safeLocalStorageGet(NUDGE_STORAGE_KEY) === "1" || panelEl()) return;
      safeLocalStorageSet(NUDGE_STORAGE_KEY, "1");
      openGuestSavePanel("nudge");
    }, NUDGE_AFTER_MS);
  }
};

export const resetGuestSavePanelForTests = (): void => {
  closeGuestSavePanel();
  document.getElementById(BADGE_ID)?.remove();
  clearNudge();
};
