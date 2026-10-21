// Display names for the seasonal AI empires ("ai-<n>" player ids). The
// simulation names its AI records from this list at worldgen, and the gateway
// (diplomacy names, the client's player list) and the leaderboard fall back to
// it too: every place a player can see or type an AI's name must agree, or a
// name read off the leaderboard won't resolve for a truce or alliance offer.

export const SEASONAL_AI_NAMES = [
  "Alden",
  "Sigrid",
  "Milo",
  "Freja",
  "Edvin",
  "Clara",
  "Hugo",
  "Linnea",
  "Rowan",
  "Tove",
  "Astrid",
  "Niko",
  "Maren",
  "Ivar",
  "Elin",
  "Rasmus",
  "Kara",
  "Oskar",
  "Solveig",
  "Bryn"
] as const;

const AI_ID_PATTERN = /^ai-(\d+)$/;

/** The listed name for "ai-<n>", or undefined for other ids and AIs past the end of the list. */
export const seasonalAiNameForId = (id: string): string | undefined => {
  const match = AI_ID_PATTERN.exec(id);
  return match ? SEASONAL_AI_NAMES[Number(match[1]) - 1] : undefined;
};

/** The old numbered stand-in ("AI 13"), still the name for AIs past the end of the list. */
export const numberedAiNameForId = (id: string): string | undefined => {
  const match = AI_ID_PATTERN.exec(id);
  return match ? `AI ${match[1]}` : undefined;
};

/** What an "ai-<n>" empire is called when it has no stored name of its own; undefined for other ids. */
export const aiDisplayNameForId = (id: string): string | undefined => seasonalAiNameForId(id) ?? numberedAiNameForId(id);

/**
 * The name to show for an AI, given the name stored for it: a stored name is
 * kept unless it is only a placeholder (the raw id, or "AI <n>" saved before
 * AIs used their listed names), which is replaced by the listed name.
 */
export const aiNameFromStored = (id: string, stored: string | undefined): string | undefined => {
  const fallback = aiDisplayNameForId(id);
  if (fallback === undefined) return stored;
  const trimmed = stored?.trim();
  return !trimmed || trimmed === id || trimmed === numberedAiNameForId(id) ? fallback : trimmed;
};
