// Server-side authority for planet christening names. Pure and dependency-free
// so it is trivially unit-testable and cannot be bypassed by the client.
export type ValidatePlanetNameResult = { ok: true; name: string } | { ok: false; reason: string };

const MIN_LENGTH = 2;
const MAX_LENGTH = 24;

// A hand-authored, deliberately small blocklist (English profanity + common
// leet substitutions are normalized away before matching, see
// `normalizeForBlocklist`). This repo has no existing profanity dependency to
// reuse — see galaxy-name-policy.test.ts for coverage of the leet cases.
const BLOCKED_WORDS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "asshole",
  "dick",
  "piss",
  "slut",
  "whore",
  "rape",
  "retard",
  "cock",
  "twat",
  "bastard"
];

const LEET_SUBSTITUTIONS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s"
};

const normalizeForBlocklist = (raw: string): string =>
  raw
    .toLowerCase()
    .split("")
    .map((ch) => LEET_SUBSTITUTIONS[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]/g, "");

const containsBlockedWord = (raw: string): boolean => {
  const normalized = normalizeForBlocklist(raw);
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
};

export const validatePlanetName = (raw: string): ValidatePlanetNameResult => {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_LENGTH) {
    return { ok: false, reason: `planet name must be at least ${MIN_LENGTH} characters` };
  }
  if (trimmed.length > MAX_LENGTH) {
    return { ok: false, reason: `planet name must be at most ${MAX_LENGTH} characters` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u.test(trimmed)) {
    return { ok: false, reason: "planet name may only contain letters, numbers, spaces, apostrophes, and hyphens" };
  }
  if (containsBlockedWord(trimmed)) {
    return { ok: false, reason: "planet name is not allowed" };
  }
  return { ok: true, name: trimmed };
};
