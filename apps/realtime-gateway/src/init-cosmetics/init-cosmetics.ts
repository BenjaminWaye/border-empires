import type { PlayerCosmeticSelection } from "@border-empires/shared";

/** One account's shown look, or undefined for the standard look. */
export type ShownCosmeticLookup = (playerId: string) => PlayerCosmeticSelection | undefined;

// INIT.playerCosmetics: the looks of the players this client can meet -- the
// current world's players, the joining player, and the pending contest's
// lobby -- never every account the server has seen. Walks those players, not
// the shown-look sets, so the cost scales with the world, not with accounts.
export const playerCosmeticsForInit = (
  shownCosmeticFor: ShownCosmeticLookup | undefined,
  playerIds: Iterable<string>
): Record<string, PlayerCosmeticSelection> | undefined => {
  if (!shownCosmeticFor) return undefined;
  const out: Record<string, PlayerCosmeticSelection> = {};
  let any = false;
  for (const playerId of playerIds) {
    if (Object.hasOwn(out, playerId)) continue;
    const selection = shownCosmeticFor(playerId);
    if (!selection) continue;
    out[playerId] = selection;
    any = true;
  }
  return any ? out : undefined;
};
