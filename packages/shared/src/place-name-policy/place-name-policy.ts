// Shared authority for player-chosen place names (planet christening in the
// gateway, island naming in the simulation). Pure and dependency-free so both
// servers apply the same rule and the client can pre-check before sending.
export type ValidatePlaceNameResult = { ok: true; name: string } | { ok: false; reason: string };

export type PlaceNameRules = {
  /** Shown in rejection reasons, e.g. "planet name". */
  readonly label: string;
  readonly minLength: number;
  readonly maxLength: number;
};

// A hand-authored, deliberately small blocklist (English profanity + common
// leet substitutions are normalized away before matching, see
// `normalizeForBlocklist`). This repo has no existing profanity dependency to
// reuse — see apps/realtime-gateway/src/galaxy-name-policy/galaxy-name-policy.test.ts for coverage of the leet cases.
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

export const containsBlockedWord = (raw: string): boolean => {
  const normalized = normalizeForBlocklist(raw);
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
};

export const validatePlaceName = (raw: string, rules: PlaceNameRules): ValidatePlaceNameResult => {
  // Inner runs of whitespace collapse to one space so "Isle   of  Brass"
  // can't be used to stretch a label or dodge the length cap.
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < rules.minLength) {
    return { ok: false, reason: `${rules.label} must be at least ${rules.minLength} characters` };
  }
  if (trimmed.length > rules.maxLength) {
    return { ok: false, reason: `${rules.label} must be at most ${rules.maxLength} characters` };
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '\-]*$/u.test(trimmed)) {
    return { ok: false, reason: `${rules.label} may only contain letters, numbers, spaces, apostrophes, and hyphens` };
  }
  if (containsBlockedWord(trimmed)) {
    return { ok: false, reason: `${rules.label} is not allowed` };
  }
  return { ok: true, name: trimmed };
};
