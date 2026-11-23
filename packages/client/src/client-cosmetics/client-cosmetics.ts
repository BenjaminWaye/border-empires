import {
  isCosmeticId,
  isEmptyCosmeticSelection,
  sanitizeCosmeticSelection,
  type AncillaryCosmeticId,
  type MusterFlagCosmeticId
} from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";

// Account cosmetics on the client (docs/gdd.md §8).
//
// `state.playerCosmetics` holds the look of every account that shows a
// non-default one; a missing entry is the default look. The map renderers read
// it through the two lookups below, so a cosmetic can never reach anything but
// drawing code.

export type CosmeticsState = Pick<ClientState, "me" | "playerCosmetics" | "ownedCosmetics" | "cosmeticsRequested">;

export type MusterFlagDesign = "default" | MusterFlagCosmeticId;
export type AncillarySkin = "default" | AncillaryCosmeticId;

export const musterFlagDesignFor = (state: Pick<ClientState, "playerCosmetics">, ownerId: string | undefined): MusterFlagDesign =>
  (ownerId ? state.playerCosmetics.get(ownerId)?.musterFlag : undefined) ?? "default";

export const ancillarySkinFor = (state: Pick<ClientState, "playerCosmetics">, ownerId: string | undefined): AncillarySkin =>
  (ownerId ? state.playerCosmetics.get(ownerId)?.ancillary : undefined) ?? "default";

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
