import { COSMETIC_CATALOG, CREST_COSMETIC_IDS, isCrestCosmeticId, ownedWithFreeCosmetics, type CrestCosmeticId } from "@border-empires/shared";

import type { ClientState } from "../client-state/client-state.js";
import { crestSvg } from "./client-house-crest-art.js";
import "./client-house-crest.css";

// House emblems: a square in the House colour bearing the House's crest, or
// its initial when it has none. Cosmetic only (docs/cosmetics.md).

/** The crest a House shows, or undefined for its letter. */
export const crestFor = (state: Pick<ClientState, "playerCosmetics">, playerId: string | undefined): CrestCosmeticId | undefined => {
  const crest = playerId ? state.playerCosmetics.get(playerId)?.crest : undefined;
  return isCrestCosmeticId(crest) ? crest : undefined;
};

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** What goes inside an emblem: the crest when set, otherwise `letters` (escaped). */
export const emblemFaceHtml = (letters: string, crest: CrestCosmeticId | undefined): string =>
  crest ? crestSvg(crest) : esc(letters);

/** The emblem's initial for a House name. */
export const emblemInitial = (name: string): string => (name.trim()[0] ?? "?").toUpperCase();

const LABEL_BY_ID: ReadonlyMap<string, string> = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry.label]));

/** The crest's name, for titles and screen readers. */
export const crestLabel = (crest: CrestCosmeticId): string => LABEL_BY_ID.get(crest) ?? "Crest";

/** The crests this account may show: every free crest plus any it was granted. */
export const availableCrests = (state: Pick<ClientState, "ownedCosmetics">): CrestCosmeticId[] => {
  const owned = new Set<string>(ownedWithFreeCosmetics(state.ownedCosmetics));
  return CREST_COSMETIC_IDS.filter((id) => owned.has(id));
};
