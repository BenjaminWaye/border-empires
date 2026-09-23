// Pure formatting for the Duke HUD and panel: durations, the one-choice banner
// text, and plain-language error messages (no raw codes ever reach the player).
import type { DukeStatus } from "./client-duke-types.js";

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
  if (ms < HOUR) return "just now";
  return `${formatDuration(ms)} ago`;
};

// §24.4: the one-choice rule is the first thing on screen.
export const choiceBanner = (status: DukeStatus, now: number): { state: "READY" | "USED"; headline: string; detail: string } => {
  if (status.gate.available || status.gate.availableAt === null) {
    return {
      state: "READY",
      headline: "Choose one action this Cycle",
      detail: "Invest, Petition the Senate, or Give an order. You get one each week."
    };
  }
  return {
    state: "USED",
    headline: "Your action is used",
    detail: `Your next choice opens in ${formatDuration(status.gate.availableAt - now)}. Defending and answering the Court are always free.`
  };
};

export const ERROR_MESSAGES: Record<string, string> = {
  NOT_A_DUKE: "You need to hold a Planet to use this.",
  INVALID: "That isn't a valid choice.",
  SLOT_BUSY: "Your build slot is busy. Wait for it to finish, or cancel it (cancelling uses your action).",
  FIGHTER_CAP: "You can't field more than 5 Fighters.",
  PROBE_STOCK_CAP: "You already hold 3 Probes. Launch one first.",
  NOTHING_TO_REPAIR: "None of your Fighters is damaged.",
  NOT_OWNED: "You don't hold that Sector.",
  NO_PROBE: "You have no Probe. Build one first (Invest).",
  NO_FIGHTER: "You have no Fighter ready. Build one first (Invest).",
  ORDER_IN_FLIGHT: "You already have an order in flight. Wait for it to arrive.",
  OWN_SECTOR: "That's your own Sector.",
  NOT_SURVEYED: "Send a Probe there first: you can only raid systems you have surveyed.",
  COURT_HAS_FALLEN: "The Court has already fallen.",
  INSUFFICIENT_INFLUENCE: "You don't have that much Influence.",
  NO_PENDING_OFFER: "There is no Court offer waiting for you.",
  NOTHING_TO_CANCEL: "There is nothing to cancel."
};

export const errorMessage = (failure: { code: string; availableAt?: number }, now: number, moveLockedUntil?: number | null): string => {
  if (failure.code === "ACTION_ALREADY_TAKEN_THIS_CYCLE") {
    return failure.availableAt === undefined
      ? "You've used your action for this Cycle."
      : `You've used your action for this Cycle. Your next choice opens in ${formatDuration(failure.availableAt - now)}.`;
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

// What the two jargon terms mean, in the words a player would use.
export const COURT_STRENGTH_HELP =
  "Court Strength is the Court's grip on the galaxy. Every Sector a Duke captures and every Influence wagered against the Court weakens it. When it reaches 0 the Court falls and the Duke with the highest Domain Weight becomes Emperor.";
export const DOMAIN_WEIGHT_HELP =
  "Domain Weight is your score for the throne: your Planets and Outposts (worth more with higher Influence output), your Stability, and Influence you've wagered against the Court. The highest Domain Weight when the Court falls wins.";
export const STABILITY_HELP =
  "Stability is how firmly you hold a Sector, out of 100. Each hit that gets through costs 20. At 0 the Sector becomes contested and anyone can win it in a Defense Campaign.";
