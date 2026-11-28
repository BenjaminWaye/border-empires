// Display names for the seasonal AI empires ("ai-<n>" player ids). The
// simulation names its AI records from this list at worldgen, and the gateway
// (diplomacy names, the client's player list) and the leaderboard fall back to
// it too: every place a player can see or type an AI's name must agree, or a
// name read off the leaderboard won't resolve for a truce or alliance offer.

// House-style, like every other House on the map (owner decision 2026-11-28,
// docs/guest-play-plan.md "House names for AIs and guests"). Their first
// halves are kept out of suggestHouseName's prefixes (display-name-uniqueness.ts)
// so a generated human name never lands on one.
export const SEASONAL_AI_NAMES = [
  "House Brassmoor",
  "House Cinderfell",
  "House Coppergate",
  "House Emberwick",
  "House Galewright",
  "House Hollowmere",
  "House Kettleford",
  "House Lanternholt",
  "House Quillhaven",
  "House Rookstead",
  "House Saltmarsh",
  "House Tinmarch",
  "House Umberly",
  "House Vanecliff",
  "House Whitlock",
  "House Pellbrook",
  "House Sterncastle",
  "House Gildmoor",
  "House Rivetstone",
  "House Fennimore"
] as const;

/**
 * The names the AIs had before 2026-11-28, by the same index. A season begun
 * before then still stores them; they are read as placeholders (aiNameFromStored)
 * so every surface shows the House name, and stay reserved and resolvable.
 */
export const LEGACY_SEASONAL_AI_NAMES = [
  "Alden", "Sigrid", "Milo", "Freja", "Edvin", "Clara", "Hugo", "Linnea", "Rowan", "Tove",
  "Astrid", "Niko", "Maren", "Ivar", "Elin", "Rasmus", "Kara", "Oskar", "Solveig", "Bryn"
] as const;

const ROMAN_CYCLE = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"] as const;

const AI_ID_PATTERN = /^ai-(\d+)$/;

/** True for a seasonal AI empire's player id ("ai-<n>"). Human ids never take this form. */
export const isSeasonalAiPlayerId = (id: string): boolean => AI_ID_PATTERN.test(id);

/**
 * The listed House name for "ai-<n>"; past the end of the list the names
 * cycle with a numeral ("House Brassmoor II"). Undefined for other ids.
 */
export const seasonalAiNameForId = (id: string): string | undefined => {
  const match = AI_ID_PATTERN.exec(id);
  if (!match) return undefined;
  const index = Number(match[1]) - 1;
  if (index < 0) return undefined;
  const base = SEASONAL_AI_NAMES[index % SEASONAL_AI_NAMES.length]!;
  const cycle = Math.floor(index / SEASONAL_AI_NAMES.length);
  if (cycle === 0) return base;
  const numeral = ROMAN_CYCLE[cycle - 1];
  return numeral ? `${base} ${numeral}` : undefined;
};

/** The pre-House name "ai-<n>" had ("Tove"), or undefined. */
export const legacySeasonalAiNameForId = (id: string): string | undefined => {
  const match = AI_ID_PATTERN.exec(id);
  return match ? LEGACY_SEASONAL_AI_NAMES[Number(match[1]) - 1] : undefined;
};

/** The old numbered stand-in ("AI 13"), and the name for AIs past every House name and numeral. */
export const numberedAiNameForId = (id: string): string | undefined => {
  const match = AI_ID_PATTERN.exec(id);
  return match ? `AI ${match[1]}` : undefined;
};

/** What an "ai-<n>" empire is called when it has no stored name of its own; undefined for other ids. */
export const aiDisplayNameForId = (id: string): string | undefined => seasonalAiNameForId(id) ?? numberedAiNameForId(id);

/**
 * The name to show for an AI, given the name stored for it: a stored name is
 * kept unless it is only a placeholder (the raw id, "AI <n>" saved before
 * AIs used their listed names, or the bare name it had before House names),
 * which is replaced by the listed name.
 */
export const aiNameFromStored = (id: string, stored: string | undefined): string | undefined => {
  const fallback = aiDisplayNameForId(id);
  if (fallback === undefined) return stored;
  const trimmed = stored?.trim();
  return !trimmed || trimmed === id || trimmed === numberedAiNameForId(id) || trimmed === legacySeasonalAiNameForId(id) ? fallback : trimmed;
};
