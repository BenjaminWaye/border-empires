import {
  isCosmeticId,
  isEmptyCosmeticSelection,
  sanitizeCosmeticSelection,
  type MusterFlagCosmeticId
} from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import type { SquadGear } from "../client-map-3d-popup-marine/popup-marine-gear.js";

// Account cosmetics on the client (docs/gdd.md §8).
//
// `state.playerCosmetics` holds the look of every account that shows a
// non-default one; a missing entry is the default look. The map renderers read
// it through the lookup below, so a cosmetic can never reach anything but
// drawing code.

export type CosmeticsState = Pick<ClientState, "me" | "playerCosmetics" | "ownedCosmetics" | "cosmeticsRequested">;

export type MusterFlagDesign = "default" | MusterFlagCosmeticId;

export const musterFlagDesignFor = (state: Pick<ClientState, "playerCosmetics">, ownerId: string | undefined): MusterFlagDesign =>
  (ownerId ? state.playerCosmetics.get(ownerId)?.musterFlag : undefined) ?? "default";

const setPlayerCosmetics = (state: Pick<ClientState, "playerCosmetics">, playerId: string, raw: unknown): void => {
  const selection = sanitizeCosmeticSelection(raw);
  if (isEmptyCosmeticSelection(selection)) state.playerCosmetics.delete(playerId);
  else state.playerCosmetics.set(playerId, selection);
};

/** INIT: the server sends every non-default look, so start from empty. */
export const applyInitPlayerCosmetics = (state: Pick<ClientState, "playerCosmetics">, raw: unknown): void => {
  state.playerCosmetics.clear();
  if (!raw || typeof raw !== "object") return;
  for (const [playerId, selection] of Object.entries(raw as Record<string, unknown>)) setPlayerCosmetics(state, playerId, selection);
};

/** PLAYER_STYLE: a `cosmetics` field replaces that player's look ({} is the default look). */
export const applyPlayerStyleCosmetics = (state: Pick<ClientState, "playerCosmetics">, playerId: string, raw: unknown): void => {
  if (playerId && raw !== undefined) setPlayerCosmetics(state, playerId, raw);
};

/** COSMETICS_STATE: what this account owns and shows. */
export const applyCosmeticsStateMessage = (state: CosmeticsState, msg: Record<string, unknown>): void => {
  state.ownedCosmetics = Array.isArray(msg.owned) ? msg.owned.filter(isCosmeticId) : [];
  if (state.me) setPlayerCosmetics(state, state.me, msg.selected);
};

/** `gear` with the ancillaries cosmetic `ownerId` shows, for the soldier
 * overlays (marineModelFor picks the model; titanium armour still wins).
 * Returns `gear` itself when the owner shows the default look, so the common
 * case allocates nothing. */
export const withSquadSkin = (
  state: Pick<ClientState, "playerCosmetics">,
  ownerId: string | undefined,
  gear: SquadGear
): SquadGear => {
  const skin = ownerId ? state.playerCosmetics.get(ownerId)?.ancillaries : undefined;
  return skin === undefined || gear.skin === skin ? gear : { ...gear, skin };
};
