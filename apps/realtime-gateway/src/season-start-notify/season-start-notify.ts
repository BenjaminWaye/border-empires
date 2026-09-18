import type { StoredAuthIdentityBinding } from "../auth-binding-store/auth-binding-store.js";
import type { EmailAlertOutcome } from "../email-alerts/email-alerts.js";

// Resend's account tier caps API calls at 10 requests/sec. This loop used to
// fire every recipient's send in the same tick with no throttling, which
// blew past that limit whenever the bound-player count got into double
// digits -- the extra requests came back 429 "Too many requests" and were
// silently dropped as send_failed (see email-alerts.ts's catch block), so
// a handful of players quietly never got the season-start email. Throttling
// to half Resend's limit leaves headroom for other alert types (attack,
// truce, alliance) sharing the same account-wide rate limit concurrently.
const SEASON_START_EMAIL_RATE_LIMIT_PER_SEC = 5;
const SEASON_START_EMAIL_INTERVAL_MS = 1_000 / SEASON_START_EMAIL_RATE_LIMIT_PER_SEC;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export type SeasonStartNotifyDeps = {
  listSeasonArchives: () => Promise<Array<{ winner?: { playerId: string; playerName: string; objectiveName: string } }>>;
  listPlayersWithEmail: () => Promise<StoredAuthIdentityBinding[]>;
  sendSeasonStartAlert: (input: {
    recipientPlayerId: string;
    previousWinnerName?: string;
    isPreviousWinner?: boolean;
    objectiveName?: string;
  }) => Promise<EmailAlertOutcome>;
  sendGameplayEmailAlert: (kind: "season_start", recipientPlayerId: string, send: () => Promise<EmailAlertOutcome>) => void;
  onError: (error: unknown, context: string) => void;
};

/**
 * Fire-and-forget: emails every player with a bound address that a new season
 * started. The just-crowned champion (looked up from the freshest season
 * archive row, which is always the season that just ended and triggered this
 * rollover) gets the same email with a victory recap folded in, instead of a
 * second separate email.
 */
export const notifySeasonStarted = (deps: SeasonStartNotifyDeps): void => {
  void (async () => {
    let previousWinnerName: string | undefined;
    let previousWinnerPlayerId: string | undefined;
    let previousWinnerObjectiveName: string | undefined;
    try {
      const [archive] = await deps.listSeasonArchives();
      if (archive?.winner) {
        previousWinnerName = archive.winner.playerName;
        previousWinnerPlayerId = archive.winner.playerId;
        previousWinnerObjectiveName = archive.winner.objectiveName;
      }
    } catch (error) {
      deps.onError(error, "failed to look up previous season winner for email alert");
    }

    let bindings: StoredAuthIdentityBinding[] = [];
    try {
      bindings = await deps.listPlayersWithEmail();
    } catch (error) {
      deps.onError(error, "failed to list players for season start email alert");
      return;
    }

    for (const [index, binding] of bindings.entries()) {
      const isPreviousWinner = binding.playerId === previousWinnerPlayerId;
      deps.sendGameplayEmailAlert("season_start", binding.playerId, () =>
        deps.sendSeasonStartAlert({
          recipientPlayerId: binding.playerId,
          ...(previousWinnerName ? { previousWinnerName } : {}),
          ...(isPreviousWinner ? { isPreviousWinner: true } : {}),
          ...(isPreviousWinner && previousWinnerObjectiveName ? { objectiveName: previousWinnerObjectiveName } : {})
        })
      );
      // Throttle to SEASON_START_EMAIL_RATE_LIMIT_PER_SEC (see comment above) --
      // skip the wait after the last recipient so we don't delay the fire-and-forget's return needlessly.
      if (index < bindings.length - 1) await sleep(SEASON_START_EMAIL_INTERVAL_MS);
    }
  })();
};
