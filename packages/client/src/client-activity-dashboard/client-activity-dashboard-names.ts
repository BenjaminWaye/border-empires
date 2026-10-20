// Cards carry only stable player ids by design (game-domain's own comment:
// a renamed/deleted player still renders correctly since the client resolves
// display names from its own live roster at render time, not from the card).
// That roster is built by activityPlayerNameLookup; these are display names
// only, never safe as gateway identity (truce/alliance target) names. An
// unresolvable id (e.g. a player who left before ever being seen) falls back
// to the raw id.
export type PlayerNameLookup = (playerId: string) => string | undefined;

export const nameOf = (playerId: string, playerNames: PlayerNameLookup): string => playerNames(playerId) ?? playerId;

// Gold/manpower amounts are summed from per-combat values that are each
// independently rounded to cents (or not rounded at all -- see
// previewSettledCapturePlunder's defenderGoldLoss) at the source. Summing
// several such floats with plain `+` reintroduces binary floating-point
// error (e.g. 12.34 + 0.66 + 5.01 + 2.33 = 20.339999999999996) well before
// it reaches display. Round once, here, at the last step before rendering.
export const roundedAmount = (value: number): number => Math.round(value);

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

export const listNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
