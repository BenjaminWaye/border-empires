// The emblem on a profile's hero card. On your own profile it is the way to
// change your crest (playtest 2026-11-27: a player tapped her plain emblem
// looking for one): it opens the Edit Name, Colour & Crest dialog
// (client-hud-profile-edit-overlay.ts), where name, colour and crest are
// chosen and saved together.

import type { CrestCosmeticId } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import { crestFor, emblemFaceHtml, emblemInitial } from "../client-house-crest/client-house-crest.js";
import { esc } from "../client-house-crest/client-crest-escape.js";
import { setProfileEditOpen } from "../client-hud/client-hud-profile-edit-overlay.js";

export type ProfileCrestFields = { crest?: CrestCosmeticId | undefined; editable?: boolean };

/** The profile's crest, and whether its emblem opens the edit dialog (your own only). */
export const profileCrestFields = (state: Pick<ClientState, "playerCosmetics">, id: string, self: boolean): ProfileCrestFields => ({
  crest: crestFor(state, id),
  editable: self
});

export const profileCrestHtml = (input: { name: string; color: string } & ProfileCrestFields): string => {
  const emblem = `<span class="v2p-crest" style="background:${esc(input.color)}" aria-hidden="true">${emblemFaceHtml(emblemInitial(input.name), input.crest)}</span>`;
  if (!input.editable) return emblem;
  return `<button type="button" class="v2p-crest-edit" data-v2-edit-profile title="Change your name, colour and crest">${emblem}<span class="v2p-crest-change">Edit crest</span></button>`;
};

/** A press on your own profile's emblem: opens the Edit Name, Colour & Crest dialog. */
export const profileCrestClick = (renderHud: () => void, target: Element): boolean => {
  if (!target.closest("[data-v2-edit-profile]")) return false;
  setProfileEditOpen(true);
  renderHud();
  return true;
};
