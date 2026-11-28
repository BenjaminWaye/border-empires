import { CREST_COSMETIC_IDS, type CrestCosmeticId } from "./cosmetics.js";

// The crest a House is given when it did not pick one: every AI House and
// every guest House (owner decision 2026-11-28, docs/cosmetics.md "Default
// crests"). AIs take the catalogue in order, so the first twelve differ;
// any other id is hashed, so the same guest always gets the same crest.

const AI_ID_PATTERN = /^ai-(\d+)$/;

const hashId = (id: string): number => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
};

export const defaultHouseCrestFor = (playerId: string): CrestCosmeticId => {
  const ai = AI_ID_PATTERN.exec(playerId);
  const index = ai ? Math.max(0, Number(ai[1]) - 1) : hashId(playerId);
  return CREST_COSMETIC_IDS[index % CREST_COSMETIC_IDS.length]!;
};
