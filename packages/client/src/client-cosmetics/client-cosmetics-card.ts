import { COSMETIC_CATALOG, COSMETIC_SLOTS, type CosmeticId, type CosmeticSlot, type PlayerCosmeticSelection } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import type { CosmeticsState } from "./client-cosmetics.js";
import { availableCrests, crestFor, emblemInitial } from "../client-house-crest/client-house-crest.js";
import { crestPickerHtml, pickedCrest } from "../client-house-crest/client-crest-picker.js";
import "./client-cosmetics-card.css";

// Settings → Account: pick which owned cosmetic the account shows.

type BindState = CosmeticsState & Pick<ClientState, "authSessionReady" | "serverSupportedMessageTypes">;

const SLOT_TITLES: Record<Exclude<CosmeticSlot, "crest">, string> = { musterFlag: "Muster flag", ancillaries: "Ancillaries" };

type CardState = Pick<ClientState, "me" | "meName" | "playerColors" | "playerCosmetics" | "ownedCosmetics" | "authSessionReady">;

// The House crest picker comes first: every crest is free, so every account has one to choose.
const crestRowHtml = (state: CardState): string => {
  const available = availableCrests(state);
  if (available.length === 0) return "";
  return `
      <div class="cosmetic-slot">
        <span class="cosmetic-slot-title">House crest</span>
        ${crestPickerHtml({
          color: state.playerColors.get(state.me) ?? "#38b000",
          initial: emblemInitial(state.meName || "?"),
          selected: crestFor(state, state.me),
          available,
          disabled: !state.authSessionReady,
          attr: "data-cosmetic-crest"
        })}
      </div>`;
};

/**
 * Settings → Account card: the House crest picker, then a row per other slot
 * the account owns a cosmetic for.
 */
export const cosmeticsCardHtml = (state: CardState): string => {
  const crestRow = crestRowHtml(state);
  if (!crestRow && state.ownedCosmetics.length === 0) return "";
  const owned = new Set<CosmeticId>(state.ownedCosmetics);
  const selection: PlayerCosmeticSelection = state.playerCosmetics.get(state.me) ?? {};
  const disabled = state.authSessionReady ? "" : "disabled";
  const option = (slot: CosmeticSlot, id: string, label: string, title: string, active: boolean): string =>
    `<button type="button" class="panel-btn cosmetic-option${active ? " is-active" : ""}" data-cosmetic-slot="${slot}" data-cosmetic-id="${id}" aria-pressed="${active}" title="${title}" ${disabled}>${label}</button>`;
  const rows = COSMETIC_SLOTS.map((slot) => {
    if (slot === "crest") return "";
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
      <p>Your House's looks. Other Houses see your choice. Looks only: nothing here changes how the game plays.</p>
      ${crestRow}
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
  dom.hud.querySelectorAll<HTMLButtonElement>("[data-cosmetic-crest]").forEach((button) => {
    button.onclick = (): void => {
      const crest = pickedCrest(button, "data-cosmetic-crest");
      if (crest !== undefined) sendGameMessage({ type: "SET_COSMETIC", slot: "crest", cosmeticId: crest }, "Finish sign-in before changing your crest.");
    };
  });
};
