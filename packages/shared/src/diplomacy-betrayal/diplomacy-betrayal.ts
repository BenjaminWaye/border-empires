// What breaking a pact costs in AI opinion (apps/realtime-gateway
// ai-diplomacy-opinion.ts). Shared so the client's "break truce / break
// alliance" confirmation states the same numbers the gateway applies.

/** How long a broken pact counts against the breaker with other AI rulers. */
export const BROKEN_PACT_OPINION_WINDOW_DAYS = 7;
export const BROKEN_PACT_OPINION_WINDOW_MS = BROKEN_PACT_OPINION_WINDOW_DAYS * 24 * 60 * 60_000;

/** The betrayed AI's season-long grudge for a broken truce. */
export const BROKEN_TRUCE_GRUDGE_OPINION_PENALTY = 60;
/** Every other AI's opinion hit per truce broken in the last 7 days, up to the cap. */
export const BROKEN_TRUCE_REPUTATION_OPINION_PENALTY = 10;
export const BROKEN_TRUCE_REPUTATION_OPINION_PENALTY_CAP = 30;

/** The ex-ally AI's opinion hit for 7 days after you start breaking your alliance. */
export const BROKEN_ALLIANCE_OPINION_PENALTY = 10;

/** True when a pact broken at `brokenAt` still counts against the breaker at `now`. */
export const brokenPactStillRemembered = (brokenAt: number, now: number): boolean => now - brokenAt < BROKEN_PACT_OPINION_WINDOW_MS;
