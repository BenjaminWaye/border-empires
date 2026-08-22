import type { StoredAuthIdentityBinding } from "../auth-binding-store/auth-binding-store.js";
import type { EmailAlertOutcome } from "../email-alerts/email-alerts.js";

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

    for (const binding of bindings) {
      const isPreviousWinner = binding.playerId === previousWinnerPlayerId;
      deps.sendGameplayEmailAlert("season_start", binding.playerId, () =>
        deps.sendSeasonStartAlert({
          recipientPlayerId: binding.playerId,
          ...(previousWinnerName ? { previousWinnerName } : {}),
          ...(isPreviousWinner ? { isPreviousWinner: true } : {}),
          ...(isPreviousWinner && previousWinnerObjectiveName ? { objectiveName: previousWinnerObjectiveName } : {})
        })
      );
    }
  })();
};
