import { COSMETIC_CATALOG, COSMETIC_SLOTS, isFreeCosmetic, type CosmeticId, type CosmeticSlot, type PlayerCosmeticSelection } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import type { CosmeticsState } from "./client-cosmetics.js";
import "./client-cosmetics-card.css";

// Settings → Account: pick which owned cosmetic the account shows.

type BindState = CosmeticsState & Pick<ClientState, "authSessionReady" | "serverSupportedMessageTypes">;

// House crests are free to own; they are picked (once per contest) in the Edit Name, Colour & Crest dialog, not here.
type CardSlot = Exclude<CosmeticSlot, "crest">;
const SLOT_TITLES: Record<CardSlot, string> = { musterFlag: "Muster flag", ancillaries: "Ancillaries" };
const CARD_SLOTS = COSMETIC_SLOTS.filter((slot): slot is CardSlot => slot !== "crest");

/**
 * Settings → Account card. Renders nothing for an account that owns no
 * cosmetic, so the page is unchanged for everyone who has bought nothing.
 */
export const cosmeticsCardHtml = (state: Pick<ClientState, "me" | "playerCosmetics" | "ownedCosmetics" | "authSessionReady">): string => {
  const owned = new Set<CosmeticId>(state.ownedCosmetics.filter((id) => !isFreeCosmetic(id)));
  if (owned.size === 0) return "";
  const selection: PlayerCosmeticSelection = state.playerCosmetics.get(state.me) ?? {};
  const disabled = state.authSessionReady ? "" : "disabled";
  const option = (slot: CardSlot, id: string, label: string, title: string, active: boolean): string =>
    `<button type="button" class="panel-btn cosmetic-option${active ? " is-active" : ""}" data-cosmetic-slot="${slot}" data-cosmetic-id="${id}" aria-pressed="${active}" title="${title}" ${disabled}>${label}</button>`;
  const rows = CARD_SLOTS.map((slot) => {
    const items = COSMETIC_CATALOG.filter((entry) => entry.slot === slot && owned.has(entry.id));
    if (items.length === 0) return "";
    const current = selection[slot];
    return `
      <div class="cosmetic-slot">
        <span class="cosmetic-slot-title">${SLOT_TITLES[slot]}</span>
        <div class="cosmetic-slot-options">
          ${option(slot, "", "Standard", "The standard look", current === undefined)}
          ${items.map((entry) => option(slot, entry.id, entry.label, entry.description, current === entry.id)).join("")}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="card auth-settings-card cosmetics-card" data-cosmetics-card>
      <p>Cosmetics your account owns. Other Houses see your choice on the map. Looks only: nothing here changes how the game plays.</p>
      ${rows}
    </div>
  `;
};

/**
 * Called after each HUD render. Asks the server once per session what the
 * account owns (on the first render with a live session, so it costs nothing
 * at login) and wires the option buttons.
 */
export const bindCosmeticsCard = (args: {
  state: BindState;
  dom: { hud: HTMLElement };
  sendGameMessage: (payload: unknown, message?: string) => boolean;
}): void => {
  const { state, dom, sendGameMessage } = args;
  if (!state.cosmeticsRequested && state.authSessionReady && state.me && state.serverSupportedMessageTypes.has("REQUEST_COSMETICS")) {
    state.cosmeticsRequested = sendGameMessage({ type: "REQUEST_COSMETICS" });
  }
  dom.hud.querySelectorAll<HTMLButtonElement>("[data-cosmetic-slot]").forEach((button) => {
    button.onclick = (): void => {
      const slot = button.dataset.cosmeticSlot;
      const cosmeticId = button.dataset.cosmeticId || null;
      sendGameMessage({ type: "SET_COSMETIC", slot, cosmeticId }, "Finish sign-in before changing a cosmetic.");
    };
  });
};
