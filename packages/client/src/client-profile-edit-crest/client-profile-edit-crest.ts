import type { CrestCosmeticId } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import { availableCrests, crestFor, crestLabel, emblemFaceHtml, emblemInitial } from "../client-house-crest/client-house-crest.js";
import { crestPickerHtml, pickedCrest } from "../client-house-crest/client-crest-picker.js";
import "./client-profile-edit-crest.css";

// The crest part of the Edit Name, Colour & Crest dialog: a live preview of
// your emblem (chosen colour and crest) above the crest picker. The choice is
// saved with the dialog's Save: SET_COSMETIC, then the dialog waits for the
// gateway's answer (COSMETICS_STATE or a COSMETIC_* ERROR) before closing.

type CrestState = Pick<ClientState, "me" | "meName" | "playerColors" | "playerCosmetics" | "ownedCosmetics" | "authSessionReady">;

const ATTR = "data-profile-edit-crest";

export const crestEditorHtml = (state: CrestState): string => {
  const color = state.playerColors.get(state.me) ?? "#38b000";
  const crest = crestFor(state, state.me);
  const initial = emblemInitial(state.meName || "?");
  return `
    <div class="profile-edit-crest">
      <div class="auth-color-label">House crest</div>
      <div class="profile-edit-preview-row">
        <span class="profile-edit-preview" data-profile-edit-preview style="background:${color}" aria-label="Your emblem">${emblemFaceHtml(initial, crest)}</span>
        <span class="profile-edit-preview-note">Shown to every House. Looks only.</span>
      </div>
      ${crestPickerHtml({ color, initial, selected: crest, available: availableCrests(state), disabled: !state.authSessionReady, attr: ATTR })}
    </div>`;
};

export type CrestEditor = {
  /** The crest the dialog will save: a crest, or null for the letter. */
  readonly chosen: () => CrestCosmeticId | null;
  /** Whether the choice differs from what the House shows now. */
  readonly changed: () => boolean;
  /** Redraws the preview and the picker's emblems in this colour and initial. */
  readonly refresh: (color: string, name: string) => void;
};

export const bindCrestEditor = (overlayEl: HTMLElement, state: CrestState, onChange: () => void): CrestEditor => {
  const current = crestFor(state, state.me) ?? null;
  let chosen: CrestCosmeticId | null = current;
  let color = state.playerColors.get(state.me) ?? "#38b000";
  let initial = emblemInitial(state.meName || "?");
  const buttons = Array.from(overlayEl.querySelectorAll<HTMLButtonElement>(`[${ATTR}]`));
  const draw = (): void => {
    const preview = overlayEl.querySelector<HTMLElement>("[data-profile-edit-preview]");
    if (preview) {
      preview.style.background = color;
      preview.innerHTML = emblemFaceHtml(initial, chosen ?? undefined);
      preview.title = chosen ? crestLabel(chosen) : "Letter";
    }
    for (const button of buttons) {
      const active = (button.getAttribute(ATTR) ?? "") === (chosen ?? "");
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
      const emblem = button.querySelector<HTMLElement>(".crest-pick-emblem");
      if (emblem) emblem.style.background = color;
      if (emblem && button.getAttribute(ATTR) === "") emblem.textContent = initial;
    }
  };
  for (const button of buttons) {
    button.onclick = (): void => {
      const pick = pickedCrest(button, ATTR);
      if (pick === undefined) return;
      chosen = pick;
      draw();
      onChange();
    };
  }
  return {
    chosen: () => chosen,
    changed: () => chosen !== current,
    refresh: (nextColor, name) => {
      color = nextColor || color;
      initial = emblemInitial(name || state.meName || "?");
      draw();
    }
  };
};

// ---------------------------------------------------------------------------
// Waiting for the gateway's answer to SET_COSMETIC {slot: "crest"}
// ---------------------------------------------------------------------------

export type CrestSaveOutcome = { ok: true } | { ok: false; reason: string };

let waiter: { crest: CrestCosmeticId | null; done: (outcome: CrestSaveOutcome) => void; timer: ReturnType<typeof setTimeout> } | undefined;

const finish = (outcome: CrestSaveOutcome): void => {
  const current = waiter;
  if (!current) return;
  clearTimeout(current.timer);
  waiter = undefined;
  current.done(outcome);
};

export const CREST_SAVE_NO_REPLY = "Crest not saved: no reply. Try again.";

const REASONS: Record<string, string> = {
  COSMETIC_NOT_OWNED: "Your account does not own that crest.",
  COSMETIC_INVALID: "That crest does not exist.",
  COSMETIC_RATE_LIMITED: "Wait a moment, then save again."
};

/** Sends the crest and resolves with the gateway's answer. Resolves at once when the send itself fails. */
export const saveCrest = (
  crest: CrestCosmeticId | null,
  sendGameMessage: (payload: unknown, message?: string) => boolean,
  timeoutMs = 15_000
): Promise<CrestSaveOutcome> =>
  new Promise((resolve) => {
    finish({ ok: false, reason: "Superseded." });
    waiter = { crest, done: resolve, timer: setTimeout(() => finish({ ok: false, reason: CREST_SAVE_NO_REPLY }), timeoutMs) };
    if (!sendGameMessage({ type: "SET_COSMETIC", slot: "crest", cosmeticId: crest }, "Finish sign-in before changing your crest.")) {
      finish({ ok: false, reason: "Not sent" });
    }
  });

/** COSMETICS_STATE: the gateway's reply to SET_COSMETIC. Settles a waiting crest save. */
export const settleCrestSaveFromState = (msg: Record<string, unknown>): void => {
  if (!waiter) return;
  const selected = msg.selected && typeof msg.selected === "object" ? (msg.selected as Record<string, unknown>).crest : undefined;
  if ((selected ?? null) === waiter.crest) finish({ ok: true });
};

/** An ERROR from the gateway: settles a waiting crest save when it is a cosmetics refusal. */
export const settleCrestSaveFromError = (code: string, message: string): void => {
  if (waiter && code.startsWith("COSMETIC_")) finish({ ok: false, reason: REASONS[code] ?? (message || "Crest not saved.") });
};

/** The dialog closed: stop waiting (the change may still land). */
export const cancelCrestSave = (): void => {
  if (!waiter) return;
  clearTimeout(waiter.timer);
  waiter = undefined;
};
