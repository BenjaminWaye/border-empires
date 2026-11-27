// The crest on a profile's hero card. On your own profile it opens the crest
// picker (playtest 2026-11-27: a player tapped her plain emblem looking for
// one); the choice goes to the gateway as SET_COSMETIC and comes back to
// everyone as PLAYER_STYLE, so nothing changes here until the server accepts.

import type { CrestCosmeticId } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import { availableCrests, crestFor, emblemFaceHtml, emblemInitial } from "../client-house-crest/client-house-crest.js";
import { crestPickerHtml, pickedCrest } from "../client-house-crest/client-crest-picker.js";

export type ProfileCrestPicker = { available: readonly CrestCosmeticId[]; disabled: boolean };

export type ProfileCrestFields = { crest?: CrestCosmeticId | undefined; crestPicker?: ProfileCrestPicker };

/** The profile's crest, and the picker when it is your own. */
export const profileCrestFields = (
  state: Pick<ClientState, "playerCosmetics" | "ownedCosmetics" | "authSessionReady">,
  id: string,
  self: boolean
): ProfileCrestFields => ({
  crest: crestFor(state, id),
  ...(self ? { crestPicker: { available: availableCrests(state), disabled: !state.authSessionReady } } : {})
});

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const profileCrestHtml = (input: { name: string; color: string } & ProfileCrestFields): string => {
  const initial = emblemInitial(input.name);
  const emblem = `<span class="v2p-crest" style="background:${esc(input.color)}" aria-hidden="true">${emblemFaceHtml(initial, input.crest)}</span>`;
  if (!input.crestPicker) return emblem;
  const picker = crestPickerHtml({
    color: input.color,
    initial,
    selected: input.crest,
    available: input.crestPicker.available,
    disabled: input.crestPicker.disabled,
    attr: "data-v2-crest"
  });
  return `<details class="v2p-crest-pick" data-v2-open="crest"><summary class="v2p-crest-summary" title="Choose your House crest">${emblem}<span class="v2p-crest-change">Choose crest</span></summary>
    <p class="v2p-crest-note">Shown on your emblem to every House. Looks only.</p>${picker}</details>`;
};

/** A press on a crest in your profile's picker: asks the gateway to show it. */
export const profileCrestClick = (sendGameMessage: (payload: unknown, message?: string) => boolean, target: Element): boolean => {
  const crest = pickedCrest(target.closest<HTMLElement>("[data-v2-crest]"), "data-v2-crest");
  if (crest === undefined) return false;
  sendGameMessage({ type: "SET_COSMETIC", slot: "crest", cosmeticId: crest }, "Finish sign-in before changing your crest.");
  return true;
};
