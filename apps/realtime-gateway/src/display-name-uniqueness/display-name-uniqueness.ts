export const DISPLAY_NAME_MAX_LENGTH = 24;

// Two names collide when they are equal after NFKC normalization, trimming,
// whitespace collapsing and lowercasing. NFKC folds look-alikes such as
// full-width letters, so "House Ashgrove" cannot be impersonated with them.
export const displayNameKey = (name: string): string =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

const RESERVED_NAME_KEYS: ReadonlySet<string> = new Set(["barbarians", "barbarian", "nauticus"]);
// "House Noname <n>" is the name guests are given (see guest-profile/), so a
// real player cannot take one and pass as a guest.
const RESERVED_NAME_PATTERNS: readonly RegExp[] = [/^ai \d+$/, /^house noname \d+$/];

// The name the gateway falls back to for an account with no display name and
// no email (for example a guest); it is a placeholder, never a chosen name.
const PLACEHOLDER_NAME_KEYS: ReadonlySet<string> = new Set(["player"]);

export const isReservedDisplayName = (name: string): boolean => {
  const key = displayNameKey(name);
  return RESERVED_NAME_KEYS.has(key) || RESERVED_NAME_PATTERNS.some((pattern) => pattern.test(key));
};

export const isDisplayNameTaken = (name: string, taken: ReadonlySet<string>): boolean =>
  taken.has(displayNameKey(name)) || isReservedDisplayName(name);

export const buildTakenNameSet = async (
  excludePlayerId: string,
  deps: {
    profileStore: { listAllNamed: () => Promise<Array<{ playerId: string; name?: string }>> };
    profileOverrides: { entries: () => IterableIterator<[string, { name?: string }]> };
  }
): Promise<Set<string>> => {
  const taken = new Set<string>();
  for (const profile of await deps.profileStore.listAllNamed()) {
    if (profile.playerId === excludePlayerId || !profile.name) continue;
    taken.add(displayNameKey(profile.name));
  }
  // Live overrides supersede stored profiles for active sessions.
  for (const [playerId, override] of deps.profileOverrides.entries()) {
    if (playerId === excludePlayerId || !override.name) continue;
    taken.add(displayNameKey(override.name));
  }
  return taken;
};

const HOUSE_PREFIXES: readonly string[] = [
  "Ash", "Black", "Bran", "Cor", "Dun", "Elm", "Fal", "Gray", "Hal", "Iron", "Kes", "Lor",
  "Mor", "Nor", "Oak", "Ral", "Sil", "Thorn", "Val", "Wyn", "Ver", "Ast", "Cal", "Dra"
];
const HOUSE_SUFFIXES: readonly string[] = [
  "grove", "mere", "wick", "ford", "moor", "crest", "holt", "vale", "mont", "ridge", "stead", "haven",
  "wald", "thorne", "gate", "field", "wood", "ley", "ton", "fell", "cliff", "march", "borne", "reach"
];
const ROMAN_NUMERALS: readonly string[] = ["II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const HOUSE_NAME_ATTEMPTS = 64;

const withNumeral = (base: string, numeral: string): string => {
  const suffix = ` ${numeral}`;
  return `${base.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
};

// "House Ashgrove": the player is an aristocrat competing for a planet, and a
// Duke only once they own one, so the default name carries no title.
export const suggestHouseName = (taken: ReadonlySet<string>, random: () => number = Math.random): string => {
  const pick = <T>(items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
  for (let attempt = 0; attempt < HOUSE_NAME_ATTEMPTS; attempt += 1) {
    const candidate = `House ${pick(HOUSE_PREFIXES)}${pick(HOUSE_SUFFIXES)}`;
    if (!isDisplayNameTaken(candidate, taken)) return candidate;
  }
  // 24 x 24 combinations exhausted (or astronomically unlucky): number one.
  const base = `House ${pick(HOUSE_PREFIXES)}${pick(HOUSE_SUFFIXES)}`;
  for (const numeral of ROMAN_NUMERALS) {
    const candidate = withNumeral(base, numeral);
    if (!isDisplayNameTaken(candidate, taken)) return candidate;
  }
  return withNumeral(base, String(Math.floor(random() * 1_000_000)));
};

// A free variation of a name someone else already holds: "Ada" -> "Ada II".
export const suggestAlternativeName = (
  name: string,
  taken: ReadonlySet<string>,
  random: () => number = Math.random
): string => {
  const base = name.trim().replace(/\s+/g, " ");
  for (const numeral of ROMAN_NUMERALS) {
    const candidate = withNumeral(base, numeral);
    if (!isDisplayNameTaken(candidate, taken)) return candidate;
  }
  return suggestHouseName(taken, random);
};

// The name to offer from what the sign-in provider told us. resolveGatewayAuthIdentity
// falls back to the email's local part when there is no display name; that is
// not a name the player chose, and showing it would reveal part of their email
// address to every other player, so it counts as "no real name".
export const providerDisplayName = (identity: { playerName: string; authEmail?: string }): string | undefined => {
  const emailLocalPart = identity.authEmail?.split("@")[0];
  if (emailLocalPart && displayNameKey(identity.playerName) === displayNameKey(emailLocalPart)) return undefined;
  return identity.playerName;
};

// The name pre-filled in the profile setup step. A real name from the
// sign-in provider is kept when it is free; a placeholder or a taken name is
// replaced by something free.
export const suggestDefaultDisplayName = (
  preferredName: string | undefined,
  taken: ReadonlySet<string>,
  random: () => number = Math.random
): string => {
  const preferred = (preferredName ?? "").trim().slice(0, DISPLAY_NAME_MAX_LENGTH);
  if (preferred.length < 2 || PLACEHOLDER_NAME_KEYS.has(displayNameKey(preferred))) return suggestHouseName(taken, random);
  if (!isDisplayNameTaken(preferred, taken)) return preferred;
  return suggestAlternativeName(preferred, taken, random);
};

// Runs one task at a time, in order. The check-then-write in SET_PROFILE spans
// several awaits, so without this two sockets could both pass the check for
// the same name. One gateway process owns all profiles, so an in-process lock
// is enough.
export const createSerialLock = (): (<T>(task: () => Promise<T>) => Promise<T>) => {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
};
