import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import type { EmailNotificationCategory, GatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { sendPlayerReportEmail } from "./bug-report-email-alert.js";
import { formatBrandedEmail, type EmailMessage, type EmailRecipient } from "./email-branded-template.js";
import { createEmailUnsubscribeSigner, resolveEmailUnsubscribeSecret } from "../email-unsubscribe/email-unsubscribe-token.js";
import type { AetherHijackAlertInput, AetherPurgeAlertInput, AttackAlertInput, ManpowerFullAlertInput, SeasonStartAlertInput, SocialRequestAlertInput, TruceRequestAlertInput } from "./email-alert-inputs.js";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";
export {
  readAetherHijackAlert,
  readAetherPurgeAlert,
  readAttackAlert,
  readIncomingAllianceBreakAlert,
  readIncomingAllianceRequestAlert,
  readIncomingTruceRequestAlert
} from "./email-alert-readers.js";

export type EmailAlertConfig = {
  resendApiKey?: string;
  from?: string;
  replyTo?: string;
  appUrl?: string;
  dailyLimit?: number;
  bugReportEmailTo?: string;
  appLabel?: string;
  // Signs per-recipient unsubscribe links; falls back to a key derived from
  // resendApiKey (see resolveEmailUnsubscribeSecret).
  unsubscribeSecret?: string;
};

export type EmailAlertService = {
  sendAllianceRequestAlert: (input: SocialRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendAllianceBreakAlert: (input: SocialRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendTruceRequestAlert: (input: TruceRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendAttackAlert: (input: AttackAlertInput) => Promise<EmailAlertOutcome>;
  sendAetherPurgeAlert: (input: AetherPurgeAlertInput) => Promise<EmailAlertOutcome>;
  sendAetherHijackAlert: (input: AetherHijackAlertInput) => Promise<EmailAlertOutcome>;
  sendSeasonStartAlert: (input: SeasonStartAlertInput) => Promise<EmailAlertOutcome>;
  sendManpowerFullAlert: (input: ManpowerFullAlertInput) => Promise<EmailAlertOutcome>;
  sendBugReportAlert: (report: BugReportInput) => void;
  sendSuggestionAlert: (report: BugReportInput) => void;
};

export type EmailAlertOutcome = "sent" | "disabled" | "recipient_missing" | "throttled" | "send_failed";

type EmailTransport = {
  send: (message: EmailMessage) => Promise<void>;
};

type EmailAlertServiceOptions = EmailAlertConfig & {
  authBindingStore: GatewayAuthBindingStore;
  // Per-player email-notification-category opt-out, set via the client's
  // Email Notifications settings page (SET_EMAIL_NOTIFICATION_PREFS). Missing
  // means every category defaults to on. Optional so existing tests/callers
  // that construct this service without a profile store keep sending
  // unconditionally.
  profileStore?: GatewayPlayerProfileStore;
  fetchImpl?: typeof fetch;
  transport?: EmailTransport;
  now?: () => number;
  log?: {
    warn?: (payload: unknown, message?: string) => void;
    error?: (payload: unknown, message?: string) => void;
  };
};

const DEFAULT_DAILY_LIMIT = 3;
const MIN_SEND_INTERVAL_MS = 60 * 60 * 1_000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const POST_TIMEOUT_MS = 5_000;

const normalizeEmail = (email: string | undefined): string | undefined => {
  const normalized = email?.trim().toLowerCase();
  return normalized ? normalized : undefined;
};

const clampDailyLimit = (limit: number | undefined): number => {
  if (typeof limit !== "number") return DEFAULT_DAILY_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_DAILY_LIMIT;
  return Math.max(1, Math.min(24, Math.floor(limit)));
};

const dayKey = (at: number): string => new Date(at).toISOString().slice(0, 10);

export const resolveEmailAppUrl = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed) return "https://staging.borderempires.com";
  return trimmed.replace(/\/+$/, "");
};

const createResendTransport = (options: {
  apiKey: string;
  from: string;
  replyTo?: string;
  fetchImpl?: typeof fetch;
}): EmailTransport => {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  return {
    async send(message) {
      if (!fetchImpl) throw new Error("fetch is unavailable");
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), POST_TIMEOUT_MS);
      try {
        const response = await fetchImpl(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            from: options.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
            ...(options.replyTo ? { reply_to: options.replyTo } : {}),
            ...(message.headers ? { headers: message.headers } : {})
          }),
          signal: ac.signal
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(`resend returned ${response.status}: ${body.slice(0, 200)}`);
        }
      } finally {
        clearTimeout(timer);
      }
    }
  };
};

export const createEmailAlertService = (options: EmailAlertServiceOptions): EmailAlertService => {
  const from = options.from?.trim();
  const apiKey = options.resendApiKey?.trim();
  const transport =
    options.transport ??
    (apiKey && from
      ? createResendTransport({
          apiKey,
          from,
          ...(options.replyTo ? { replyTo: options.replyTo } : {}),
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {})
        })
      : undefined);
  const now = options.now ?? (() => Date.now());
  const dailyLimit = clampDailyLimit(options.dailyLimit);
  const appUrl = resolveEmailAppUrl(options.appUrl);
  const unsubscribeSecret = resolveEmailUnsubscribeSecret(options);
  const unsubscribeSigner = unsubscribeSecret ? createEmailUnsubscribeSigner(unsubscribeSecret) : undefined;
  const countersByEmail = new Map<string, { day: string; sent: number; lastSentAt: number }>();

  const send = async (
    recipientPlayerId: string,
    category: EmailNotificationCategory,
    build: (recipient: EmailRecipient) => EmailMessage,
    sendOptions?: { bypassRateLimit?: boolean }
  ): Promise<EmailAlertOutcome> => {
    if (!transport) return "disabled";
    if (options.profileStore) {
      const profile = await options.profileStore.get(recipientPlayerId);
      // Default on: only an explicit `false` opts the player out.
      if (profile?.emailNotificationPrefs?.[category] === false) return "disabled";
    }
    const binding = await options.authBindingStore.getByPlayerId(recipientPlayerId);
    const email = normalizeEmail(binding?.email);
    if (!email) return "recipient_missing";

    const sentAt = now();
    const today = dayKey(sentAt);
    const counter = countersByEmail.get(email);
    const bypassRateLimit = sendOptions?.bypassRateLimit === true;
    if (!bypassRateLimit) {
      const sentToday = counter?.day === today ? counter.sent : 0;
      if (sentToday >= dailyLimit) return "throttled";
      if (counter && sentAt - counter.lastSentAt < MIN_SEND_INTERVAL_MS) return "throttled";
      countersByEmail.set(email, { day: today, sent: sentToday + 1, lastSentAt: sentAt });
    }

    try {
      const unsubscribeUrl = unsubscribeSigner?.url(appUrl, recipientPlayerId, category);
      await transport.send(build({ to: email, ...(unsubscribeUrl ? { unsubscribeUrl } : {}) }));
      return "sent";
    } catch (error) {
      if (!bypassRateLimit) {
        if (counter) {
          countersByEmail.set(email, counter);
        } else {
          countersByEmail.delete(email);
        }
      }
      options.log?.error?.(
        { err: error instanceof Error ? error.message : String(error), recipientPlayerId },
        "failed to send gameplay email alert"
      );
      return "send_failed";
    }
  };

  return {
    sendBugReportAlert(report) {
      void sendPlayerReportEmail("bug", report, {
        ...(apiKey ? { resendApiKey: apiKey } : {}),
        ...(from ? { from } : {}),
        ...(options.bugReportEmailTo ? { to: options.bugReportEmailTo } : {}),
        ...(options.appLabel ? { appLabel: options.appLabel } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.log ? { log: options.log } : {})
      });
    },
    sendSuggestionAlert(report) {
      void sendPlayerReportEmail("suggestion", report, {
        ...(apiKey ? { resendApiKey: apiKey } : {}),
        ...(from ? { from } : {}),
        ...(options.bugReportEmailTo ? { to: options.bugReportEmailTo } : {}),
        ...(options.appLabel ? { appLabel: options.appLabel } : {}),
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        ...(options.log ? { log: options.log } : {})
      });
    },
    sendAllianceRequestAlert(input) {
      return send(
        input.recipientPlayerId,
        "allianceRequest",
        (recipient) =>
          formatBrandedEmail(appUrl, {
            ...recipient,
            subject: `${input.senderName} sent you an alliance request`,
            eyebrow: "Border Empires — Alliance Request",
            headline: "You've Been Offered an Alliance",
            body: [
              `${input.senderName} sent your empire an alliance request.`,
              "Open Border Empires to accept or reject it."
            ],
            linkLabel: "Respond to Request"
          }),
        { bypassRateLimit: true }
      );
    },
    sendAllianceBreakAlert(input) {
      return send(
        input.recipientPlayerId,
        "allianceBreak",
        (recipient) =>
          formatBrandedEmail(appUrl, {
            ...recipient,
            subject: `${input.senderName} started breaking your alliance`,
            eyebrow: "Border Empires — Alliance Break Notice",
            headline: "An Alliance Break Is Underway",
            body: [
              `${input.senderName} started a 24-hour notice to break your alliance.`,
              "The alliance stays active for the next 24 hours, so you still have time to prepare before it ends."
            ],
            highlight: { label: "Break Completes In", value: "24 hours" },
            linkLabel: "Open Border Empires"
          }),
        { bypassRateLimit: true }
      );
    },
    sendTruceRequestAlert(input) {
      return send(
        input.recipientPlayerId,
        "truceOffer",
        (recipient) =>
          formatBrandedEmail(appUrl, {
            ...recipient,
            subject: `${input.senderName} offered you a ${input.durationHours}h truce`,
            eyebrow: "Border Empires — Truce Offer",
            headline: "You've Been Offered a Truce",
            body: [
              `${input.senderName} offered your empire a ${input.durationHours}h truce.`,
              "Open Border Empires to accept or reject it before the offer expires."
            ],
            highlight: { label: "Truce Duration", value: `${input.durationHours} hours` },
            linkLabel: "Respond to Offer"
          }),
        { bypassRateLimit: true }
      );
    },
    sendAttackAlert(input) {
      return send(input.defenderPlayerId, "attackAlert", (recipient) =>
        formatBrandedEmail(appUrl, {
          ...recipient,
          subject: `${input.attackerName} is attacking your empire`,
          eyebrow: "Border Empires — Under Attack",
          headline: "Your Empire Is Under Attack",
          body: [
            `${input.attackerName} launched an attack against your empire.`,
            "Rally your defenses before the assault lands."
          ],
          highlight: { label: "Target Tile", value: `${input.x}, ${input.y}` },
          // Deep-links straight to the targeted tile: readUrlTileFocus() in
          // client-camera-storage.ts (packages/client) picks up ?x=&y= on
          // boot and centers the camera there instead of the player's home tile.
          linkUrl: `${appUrl}/?x=${input.x}&y=${input.y}`,
          linkLabel: "Go to Tile"
        })
      );
    },
    sendAetherPurgeAlert(input) {
      // Shares the same per-recipient send() throttle as sendAttackAlert
      // (MIN_SEND_INTERVAL_MS, keyed by email) so a player under sustained
      // aether or conventional assault still gets at most one email an hour.
      return send(input.defenderPlayerId, "aetherPurgeAlert", (recipient) =>
        formatBrandedEmail(appUrl, {
          ...recipient,
          subject: `${input.attackerName} hit your empire with an aether purge`,
          eyebrow: "Border Empires — Aether Attack",
          headline: "Your Empire Was Aether-Purged",
          body: [
            `${input.attackerName} struck your territory with an Aether Purge — you've lost control of the tile.`,
            "Reinforce your border before they press the advantage."
          ],
          highlight: { label: "Tile Lost", value: `${input.x}, ${input.y}` },
          linkUrl: `${appUrl}/?x=${input.x}&y=${input.y}`,
          linkLabel: "Go to Tile"
        })
      );
    },
    sendAetherHijackAlert(input) {
      // Time-critical (the takeover finishes in minutes), so it skips the hourly throttle like truce offers.
      const deadline = new Date(input.endsAt).toISOString().slice(11, 16);
      return send(input.defenderPlayerId, "aetherHijackAlert", (recipient) =>
        formatBrandedEmail(appUrl, {
          ...recipient,
          subject: `${input.attackerName} is hijacking your Aether Tower`,
          eyebrow: "Border Empires — Tower Hijack",
          headline: "Your Aether Tower Is Being Taken Over",
          body: [`${input.attackerName} is seizing your Aether Tower at ${input.x}, ${input.y}. The takeover completes at ${deadline} UTC.`, `Capture, suppress or cut power to their casting tower at ${input.casterX}, ${input.casterY} to stop it.`],
          highlight: { label: "Casting Tower", value: `${input.casterX}, ${input.casterY}` },
          linkUrl: `${appUrl}/?x=${input.casterX}&y=${input.casterY}`,
          linkLabel: "Defend Now"
        }), { bypassRateLimit: true });
    },
    sendManpowerFullAlert(input) {
      // docs/replenishment-update-plan.md D1/D11: the main "come back" signal
      // — after manpower hits its cap, regen is wasted. Uses send()'s
      // ordinary per-recipient throttle (same shape as attack alerts) rather
      // than a bespoke one-per-absence tracker: the caller (runtime-manpower-
      // full-alert.ts) already only fires this while the player is offline
      // and only once per full-to-not-full cycle, so the throttle here is
      // just a backstop against duplicate sends racing a reconnect.
      return send(input.recipientPlayerId, "manpowerFull", (recipient) =>
        formatBrandedEmail(appUrl, {
          ...recipient,
          subject: "Your manpower is full in Border Empires",
          eyebrow: "Border Empires — Manpower Full",
          headline: "Your Manpower Has Filled Up",
          body: [
            "Your empire's manpower pool has reached its cap — regeneration beyond this point is wasted.",
            "Come back to spend it: build, attack, or muster before it sits idle."
          ],
          linkLabel: "Open Border Empires"
        })
      );
    },
    sendSeasonStartAlert(input) {
      const isPreviousWinner = input.isPreviousWinner === true;
      // A forced rollover archives a contest with no winner, which has no
      // recap to show, so only point at the recap when someone was crowned.
      const hasRecap = isPreviousWinner || Boolean(input.previousWinnerName);
      return send(
        input.recipientPlayerId,
        "seasonStart",
        (recipient) =>
          formatBrandedEmail(appUrl, {
            ...recipient,
            subject: isPreviousWinner ? "You won the Sector Contest — and a new one has begun in Border Empires" : "A new Sector Contest has begun in Border Empires",
            eyebrow: isPreviousWinner ? "Border Empires — Sector Contest Recap" : "Border Empires",
            headline: isPreviousWinner ? "Victory Is Yours" : "A New Sector Contest Has Begun",
            body: isPreviousWinner
              ? [
                  "Your empire outbuilt, outmaneuvered, and outlasted every rival on the map.",
                  input.objectiveName
                    ? `You claimed victory through ${input.objectiveName}, and your name is now etched into this Sector Contest's history.`
                    : "Your name is now etched into this Sector Contest's history.",
                  "The map has already reset for a new Sector Contest — come defend your title before your rivals stake their claim.",
                  "Last Sector Contest's final stats — yours, your allies', and your rivals' — are ready to browse on the recap screen. Open it from the link below, or any time from the Last Contest Recap button on the leaderboard."
                ]
              : [
                  "The map has been reset, borders are undrawn, and every empire starts from the same first tile again.",
                  "Claim your territory early, forge alliances, and build toward this Sector Contest's objective before your rivals do.",
                  ...(hasRecap
                    ? ["Curious how the last Sector Contest shook out? The recap screen shows final stats for you and every friend or foe you played against. Open it from the link below, or any time from the Last Contest Recap button on the leaderboard."]
                    : [])
                ],
            ...(isPreviousWinner
              ? { highlight: { label: "Status", value: "Sector Contest Champion" } }
              : input.previousWinnerName
                ? { highlight: { label: "Reigning Champion", value: input.previousWinnerName } }
                : {}),
            linkLabel: isPreviousWinner ? "Defend Your Title" : "Start Your Empire",
            // The client opens the archived recap overlay for ?recap=last
            // (client-last-contest-recap). Plain "/?..." so Caddy serves index.html.
            ...(hasRecap ? { secondaryLink: { url: `${appUrl}/?recap=last`, label: "View the last contest's recap" } } : {})
          }),
        { bypassRateLimit: true }
      );
    }
  };
};
