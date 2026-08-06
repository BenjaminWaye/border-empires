import { NATURAL_WONDER_LABELS, type NaturalWonderType } from "@border-empires/shared";

// Event-log entry text fired when a player claims a natural wonder tile
// (runtime-natural-wonders.ts's announceNaturalWonderClaim). Copy lives in
// NATURAL_WONDER_LABELS (shared) so the sim's claim text and the client's
// tile overview stay in sync.
export const naturalWonderClaimEventText = (type: NaturalWonderType): string => {
  const { name, flavor, boon } = NATURAL_WONDER_LABELS[type];
  return `You claimed ${name} — ${flavor}. Boon: ${boon}.`;
};
