// Truce-ending email: one email to each side of a truce when it has about an
// hour left. Playtest: truces lapsed while players were offline and AIs took
// everything within minutes; the in-game warning (client-truce-ending.ts)
// only reaches players who are looking.
//
// Once per truce end: the notifier remembers which endsAt it warned about per
// pair. An extension moves endsAt, so the extended truce warns again when its
// new end comes within the window.
//
// Bounding (docs/agents/state-and-persistence-discipline.md): the warned map
// holds at most one entry per running truce and is pruned against the active
// truce list on every tick. It is not persisted: after a gateway restart, a
// truce already more than BOOT_GRACE into its last hour is assumed warned by
// the previous process (which ticks every minute) and is skipped, so a deploy
// doesn't resend; one that entered the window during the restart still warns.
import type { EmailAlertOutcome } from "../email-alerts/email-alerts.js";
import type { TruceEndingAlertInput } from "../email-alerts/email-alert-inputs.js";
import type { SendGameplayEmailAlert } from "../gameplay-email-alert/gameplay-email-alert.js";

export const TRUCE_ENDING_EMAIL_WINDOW_MS = 60 * 60_000;
export const TRUCE_ENDING_EMAIL_BOOT_GRACE_MS = 5 * 60_000;

export type TruceEndingCandidate = {
  playerAId: string;
  playerBId: string;
  startedAt: number;
  endsAt: number;
};

/**
 * Running and inside its last hour. A truce whose whole length fits inside
 * the window never warns: it would be "ending soon" the moment it started.
 */
export const truceEndingEmailDue = (truce: TruceEndingCandidate, nowMs: number): boolean =>
  truce.endsAt > nowMs &&
  truce.endsAt - nowMs <= TRUCE_ENDING_EMAIL_WINDOW_MS &&
  truce.endsAt - truce.startedAt > TRUCE_ENDING_EMAIL_WINDOW_MS;

export type TruceEndingEmailNotifierDeps = {
  activeTruces: () => readonly TruceEndingCandidate[];
  nameOf: (playerId: string) => string;
  /** AIs have no inbox; skipped before any store lookup. */
  isAiPlayer: (playerId: string) => boolean;
  sendTruceEndingAlert: (input: TruceEndingAlertInput) => Promise<EmailAlertOutcome>;
  sendGameplayEmailAlert: SendGameplayEmailAlert;
  /** Counter for the restart skip (state-and-persistence-discipline: every guard emits). */
  onBootSkipped?: (count: number) => void;
};

export type TruceEndingEmailNotifier = {
  tick: (nowMs: number) => void;
  /** Gauge: pairs remembered as warned (bounded by running truces). */
  size: () => number;
};

const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const createTruceEndingEmailNotifier = (deps: TruceEndingEmailNotifierDeps): TruceEndingEmailNotifier => {
  const warnedEndsAtByPair = new Map<string, number>();
  let firstTick = true;

  const warn = (recipientId: string, otherId: string, endsAt: number): void => {
    if (deps.isAiPlayer(recipientId)) return;
    const otherPartyName = deps.nameOf(otherId);
    deps.sendGameplayEmailAlert("truce_ending", recipientId, () =>
      deps.sendTruceEndingAlert({ recipientPlayerId: recipientId, otherPartyName, endsAt })
    );
  };

  return {
    tick(nowMs) {
      const activeKeys = new Set<string>();
      let bootSkipped = 0;
      for (const truce of deps.activeTruces()) {
        const key = pairKey(truce.playerAId, truce.playerBId);
        activeKeys.add(key);
        if (warnedEndsAtByPair.get(key) === truce.endsAt) continue;
        if (!truceEndingEmailDue(truce, nowMs)) continue;
        warnedEndsAtByPair.set(key, truce.endsAt);
        if (firstTick && truce.endsAt - nowMs <= TRUCE_ENDING_EMAIL_WINDOW_MS - TRUCE_ENDING_EMAIL_BOOT_GRACE_MS) {
          bootSkipped += 1;
          continue;
        }
        warn(truce.playerAId, truce.playerBId, truce.endsAt);
        warn(truce.playerBId, truce.playerAId, truce.endsAt);
      }
      firstTick = false;
      for (const key of [...warnedEndsAtByPair.keys()]) if (!activeKeys.has(key)) warnedEndsAtByPair.delete(key);
      if (bootSkipped > 0) deps.onBootSkipped?.(bootSkipped);
    },
    size: () => warnedEndsAtByPair.size
  };
};
