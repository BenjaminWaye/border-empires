// Pure formatting for the Duke HUD and panel: durations, attention lines, body
// names and plain-language error messages (no raw code ever reaches the player).
import type { DukeAttentionItem, GalaxyBodyKind } from "./client-duke-types.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const formatDuration = (ms: number): string => {
  if (ms <= 0) return "any moment now";
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)}h ${Math.round((ms % HOUR) / MINUTE)}m`;
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms % DAY) / HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
};

export const formatAge = (at: number, now: number): string => {
  const ms = Math.max(0, now - at);
  return ms < HOUR ? "just now" : `${formatDuration(ms)} ago`;
};

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export const BODY_NAMES: Record<GalaxyBodyKind, string> = {
  GAS_GIANT: "Gas giant",
  ASTEROID_BELT: "Asteroid belt",
  ICE_MOON: "Ice moon"
};

// One line per thing that needs the player, worded as a person would say it.
export const attentionText = (item: DukeAttentionItem, now: number): string => {
  switch (item.kind) {
    case "INCURSION_UNDEFENDED":
      return `Craft arriving at ${item.label} in ${formatDuration((item.at ?? now) - now)}. No Fighter there.`;
    case "INCURSION_DEFENDED":
      return `Craft arriving at ${item.label} in ${formatDuration((item.at ?? now) - now)}. Your Fighter will meet it.`;
    case "LOW_STABILITY":
      return `${item.label} is one or two hits from being contested.`;
    case "SLOT_EMPTY":
      return `${item.label} has nothing building.`;
    case "FIGHTER_DAMAGED":
      return `A Fighter at ${item.label} is badly damaged.`;
    case "COURT_OFFER":
      return "The Court has an offer for you.";
    case "PETITION_READY":
      return "You can Move Against the Court.";
  }
};

export const ERROR_MESSAGES: Record<string, string> = {
  NOT_A_DUKE: "You need to hold a Planet to use this.",
  INVALID: "That isn't a valid choice.",
  NO_SUCH_SYSTEM: "You don't hold that system.",
  SLOT_BUSY: "This system is already building something. Wait for it to finish, or cancel it.",
  FIGHTER_CAP: "A system can't hold more than 3 Fighters.",
  PROBE_STOCK_CAP: "This system already holds 3 Probes. Launch one first.",
  NOTHING_TO_REPAIR: "None of the Fighters here is damaged.",
  NO_SUCH_BODY: "There is no such body in this system.",
  BODY_ALREADY_DEVELOPED: "That body already has a development.",
  NO_PROBE: "There is no Probe in this system. Build one first.",
  NO_FIGHTER: "There is no Fighter in this system. Build one first.",
  TOO_MANY_FLIGHTS: "Too many orders are already in flight. Wait for one to arrive.",
  OWN_SECTOR: "That's your own system.",
  NOT_SURVEYED: "Send a Probe there first: you can only raid systems you have surveyed.",
  COURT_HAS_FALLEN: "The Court has already fallen.",
  INSUFFICIENT_INFLUENCE: "You don't have that much Influence.",
  NO_PENDING_OFFER: "There is no Court offer waiting for you.",
  NOTHING_TO_CANCEL: "There is nothing to cancel."
};

export const errorMessage = (failure: { code: string; availableAt?: number }, now: number, moveLockedUntil?: number | null): string => {
  if (failure.code === "PETITION_ALREADY_MADE_THIS_CYCLE") {
    return failure.availableAt === undefined
      ? "You've already petitioned this Cycle."
      : `You've already petitioned this Cycle. You can again in ${formatDuration(failure.availableAt - now)}.`;
  }
  if (failure.code === "LOCKED_BY_COURT_OFFER") {
    return moveLockedUntil
      ? `You accepted the Court's protection, so you can't Move Against the Court for another ${formatDuration(moveLockedUntil - now)}.`
      : "You accepted the Court's protection, so you can't Move Against the Court yet.";
  }
  return ERROR_MESSAGES[failure.code] ?? "That could not be done right now.";
};

export const HTTP_FALLBACK_MESSAGES: Record<number, string> = {
  401: "Sign in to use Duke actions.",
  403: "You need to hold a Planet to use this.",
  503: "The galactic layer is unavailable right now."
};

// What the jargon means, in the words a player would use.
export const COURT_STRENGTH_HELP =
  "Court Strength is the Court's grip on the galaxy. Every Sector a Duke captures and every Influence wagered against the Court weakens it. When it reaches 0 the Court falls and the Duke with the highest Domain Weight becomes Emperor.";
export const DOMAIN_WEIGHT_HELP =
  "Domain Weight is your score for the throne: your Planets and Outposts (worth more with higher Influence output), your Stability, and Influence you've wagered against the Court. The highest Domain Weight when the Court falls wins.";
export const STABILITY_HELP =
  "Stability is how firmly you hold a Sector, out of 100. Each hit that gets through costs 20. At 0 the Sector becomes contested and anyone can win it in a Defense Campaign.";
export const WARDEN_HELP =
  "Wardens are ancient machines that attack Planets. They are worst when the galaxy is young: the same few attacks are shared between every Planet, so each new Planet eases everyone's share.";
