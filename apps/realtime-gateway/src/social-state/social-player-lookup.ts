import { numberedAiNameForId } from "@border-empires/shared";

import type { SocialPlayerRecord } from "./social-state-types.js";

/**
 * The player a typed name refers to, case-insensitively. A human who took an
 * AI's listed name before it was reserved keeps it: the human wins the tie,
 * and that AI stays reachable by its old "AI 13" name.
 */
export const resolveSocialPlayerByName = (
  playersById: ReadonlyMap<string, SocialPlayerRecord>,
  playerName: string
): SocialPlayerRecord | undefined => {
  const needle = playerName.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  let aiMatch: SocialPlayerRecord | undefined;
  for (const player of playersById.values()) {
    if (player.name.trim().toLocaleLowerCase() !== needle) continue;
    if (numberedAiNameForId(player.id) === undefined) return player;
    aiMatch ??= player;
  }
  if (aiMatch) return aiMatch;
  // "AI 13" was every AI's name before they used their listed ones; a client that still shows it can still reach them.
  for (const player of playersById.values()) {
    if (numberedAiNameForId(player.id)?.toLocaleLowerCase() === needle) return player;
  }
  return undefined;
};
