import type { GatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { unwrapPayloadSource } from "../broadcast-payload/broadcast-payload.js";
import { sendBugReportEmail } from "./bug-report-email-alert.js";
import type { BugReportInput } from "../slack-alerts/slack-alerts.js";

export type EmailAlertConfig = {
  resendApiKey?: string;
  from?: string;
  replyTo?: string;
  appUrl?: string;
  dailyLimit?: number;
  bugReportEmailTo?: string;
  appLabel?: string;
};

export type EmailAlertService = {
  sendAllianceRequestAlert: (input: SocialRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendTruceRequestAlert: (input: TruceRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendAttackAlert: (input: AttackAlertInput) => Promise<EmailAlertOutcome>;
  sendSeasonStartAlert: (input: SeasonStartAlertInput) => Promise<EmailAlertOutcome>;
  sendBugReportAlert: (report: BugReportInput) => void;
};

export type EmailAlertOutcome = "sent" | "disabled" | "recipient_missing" | "throttled" | "send_failed";

type SocialRequestAlertInput = {
  recipientPlayerId: string;
  senderName: string;
};

type TruceRequestAlertInput = SocialRequestAlertInput & {
  durationHours: 12 | 24;
};

type AttackAlertInput = {
  defenderPlayerId: string;
  attackerName: string;
  x: number;
  y: number;
};

type SeasonStartAlertInput = {
  recipientPlayerId: string;
  previousWinnerName?: string;
  /** True when recipientPlayerId is themself the previous season's winner — folds a victory recap into this same email. */
  isPreviousWinner?: boolean;
  objectiveName?: string;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailTransport = {
  send: (message: EmailMessage) => Promise<void>;
};

export type IncomingAllianceRequestAlert = {
  recipientPlayerId: string;
  senderName: string;
};

export type IncomingTruceRequestAlert = IncomingAllianceRequestAlert & {
  durationHours: 12 | 24;
};

export type IncomingAttackAlert = {
  attackerName: string;
  x: number;
  y: number;
};

type EmailAlertServiceOptions = EmailAlertConfig & {
  authBindingStore: GatewayAuthBindingStore;
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

const readStringField = (value: Record<string, unknown>, key: string): string | undefined => {
  const field = value[key];
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
};

const readNumberField = (value: Record<string, unknown>, key: string): number | undefined => {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
};

export const readIncomingAllianceRequestAlert = (
  payloadsByPlayerId: Map<string, unknown[]>
): IncomingAllianceRequestAlert | undefined => {
  for (const [playerId, payloads] of payloadsByPlayerId) {
    for (const payload of payloads) {
      const source = unwrapPayloadSource(payload);
      if (!source || typeof source !== "object") continue;
      const typed = source as Record<string, unknown>;
      if (typed.type !== "ALLIANCE_REQUEST_INCOMING") continue;
      const request = typed.request && typeof typed.request === "object" ? (typed.request as Record<string, unknown>) : undefined;
      return {
        recipientPlayerId: readStringField(request ?? typed, "toPlayerId") ?? playerId,
        senderName:
          readStringField(typed, "fromName") ??
          (request ? readStringField(request, "fromName") : undefined) ??
          readStringField(request ?? typed, "fromPlayerId") ??
          "Another empire"
      };
    }
  }
  return undefined;
};

export const readIncomingTruceRequestAlert = (
  payloadsByPlayerId: Map<string, unknown[]>
): IncomingTruceRequestAlert | undefined => {
  for (const [playerId, payloads] of payloadsByPlayerId) {
    for (const payload of payloads) {
      const source = unwrapPayloadSource(payload);
      if (!source || typeof source !== "object") continue;
      const typed = source as Record<string, unknown>;
      if (typed.type !== "TRUCE_REQUEST_INCOMING") continue;
      const request = typed.request && typeof typed.request === "object" ? (typed.request as Record<string, unknown>) : undefined;
      const durationHours = readNumberField(request ?? typed, "durationHours");
      if (durationHours !== 12 && durationHours !== 24) continue;
      return {
        recipientPlayerId: readStringField(request ?? typed, "toPlayerId") ?? playerId,
        senderName:
          readStringField(typed, "fromName") ??
          (request ? readStringField(request, "fromName") : undefined) ??
          readStringField(request ?? typed, "fromPlayerId") ??
          "Another empire",
        durationHours
      };
    }
  }
  return undefined;
};

export const readAttackAlert = (payload: Record<string, unknown>): IncomingAttackAlert | undefined => {
  if (payload.type !== "ATTACK_ALERT") return undefined;
  const x = readNumberField(payload, "x");
  const y = readNumberField(payload, "y");
  if (typeof x !== "number" || typeof y !== "number") return undefined;
  return {
    attackerName: readStringField(payload, "attackerName") ?? readStringField(payload, "attackerId") ?? "Another empire",
    x,
    y
  };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const baseUrl = (value: string | undefined): string => {
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
            ...(options.replyTo ? { reply_to: options.replyTo } : {})
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
  const appUrl = baseUrl(options.appUrl);
  const countersByEmail = new Map<string, { day: string; sent: number; lastSentAt: number }>();

  const send = async (
    recipientPlayerId: string,
    build: (email: string) => EmailMessage,
    sendOptions?: { bypassRateLimit?: boolean }
  ): Promise<EmailAlertOutcome> => {
    if (!transport) return "disabled";
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
      await transport.send(build(email));
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

  const formatMessage = (input: {
    to: string;
    subject: string;
    intro: string;
    detail: string;
    linkUrl?: string;
    linkLabel?: string;
  }): EmailMessage => {
    const linkUrl = input.linkUrl ?? appUrl;
    const linkLabel = input.linkLabel ?? "Open Border Empires";
    const safeIntro = escapeHtml(input.intro);
    const safeDetail = escapeHtml(input.detail);
    const safeLinkUrl = escapeHtml(linkUrl);
    const safeLinkLabel = escapeHtml(linkLabel);
    return {
      to: input.to,
      subject: input.subject,
      text: `${input.intro}\n\n${input.detail}\n\n${linkLabel}: ${linkUrl}`,
      html: `<p>${safeIntro}</p><p>${safeDetail}</p><p><a href="${safeLinkUrl}">${safeLinkLabel}</a></p>`
    };
  };

  const formatSeasonMessage = (input: {
    to: string;
    subject: string;
    eyebrow: string;
    headline: string;
    body: string[];
    highlight?: { label: string; value: string };
    linkUrl?: string;
    linkLabel?: string;
  }): EmailMessage => {
    const linkUrl = input.linkUrl ?? appUrl;
    const linkLabel = input.linkLabel ?? "Enter Border Empires";
    const safeHeadline = escapeHtml(input.headline);
    const safeEyebrow = escapeHtml(input.eyebrow);
    const safeBody = input.body.map(escapeHtml);
    const safeLinkUrl = escapeHtml(linkUrl);
    const safeLinkLabel = escapeHtml(linkLabel);

    const highlightHtml = input.highlight
      ? `<tr><td style="padding:24px 40px 0;">
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#241a08,#2f2107);border:1px solid #a9791f;border-radius:10px;">
             <tr>
               <td style="padding:20px 24px;text-align:center;">
                 <div style="font:600 11px/1.4 'Segoe UI',Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#e0b84a;">${escapeHtml(input.highlight.label)}</div>
                 <div style="font:700 22px/1.4 Georgia,'Times New Roman',serif;color:#fbe7ad;margin-top:6px;">${escapeHtml(input.highlight.value)}</div>
               </td>
             </tr>
           </table>
         </td></tr>`
      : "";

    const bodyHtml = safeBody.map((line) => `<p style="margin:0 0 14px;font:400 15px/1.6 'Segoe UI',Arial,sans-serif;color:#cbd2de;">${line}</p>`).join("");

    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0d14;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#141826;border-radius:14px;overflow:hidden;border:1px solid #262c40;">
            <tr>
              <td style="background:linear-gradient(135deg,#1c2438,#0e1220);padding:32px 40px 24px;text-align:center;border-bottom:1px solid #2a3350;">
                <div style="font:600 12px/1 'Segoe UI',Arial,sans-serif;letter-spacing:3px;text-transform:uppercase;color:#7c8bb3;">${safeEyebrow}</div>
                <div style="font:700 26px/1.3 Georgia,'Times New Roman',serif;color:#f3d98b;margin-top:10px;">${safeHeadline}</div>
              </td>
            </tr>
            ${highlightHtml}
            <tr>
              <td style="padding:28px 40px 8px;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 36px;text-align:center;">
                <a href="${safeLinkUrl}" style="display:inline-block;padding:14px 32px;background:#c8952f;color:#1a1305;font:700 14px/1 'Segoe UI',Arial,sans-serif;letter-spacing:0.5px;text-decoration:none;border-radius:8px;">${safeLinkLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 40px 28px;border-top:1px solid #232a3f;text-align:center;">
                <div style="font:400 12px/1.5 'Segoe UI',Arial,sans-serif;color:#5b647f;">Border Empires &mdash; build, ally, conquer.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

    return {
      to: input.to,
      subject: input.subject,
      text: `${input.headline}\n\n${input.body.join("\n\n")}${input.highlight ? `\n\n${input.highlight.label}: ${input.highlight.value}` : ""}\n\n${linkLabel}: ${linkUrl}`,
      html
    };
  };

  return {
    sendBugReportAlert(report) {
      void sendBugReportEmail(report, {
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
        (to) =>
          formatMessage({
            to,
            subject: `${input.senderName} sent you an alliance request`,
            intro: `${input.senderName} sent your empire an alliance request.`,
            detail: "Open Border Empires to accept or reject it."
          }),
        { bypassRateLimit: true }
      );
    },
    sendTruceRequestAlert(input) {
      return send(
        input.recipientPlayerId,
        (to) =>
          formatMessage({
            to,
            subject: `${input.senderName} offered you a ${input.durationHours}h truce`,
            intro: `${input.senderName} offered your empire a ${input.durationHours}h truce.`,
            detail: "Open Border Empires to accept or reject it before the offer expires."
          }),
        { bypassRateLimit: true }
      );
    },
    sendAttackAlert(input) {
      return send(input.defenderPlayerId, (to) =>
        formatMessage({
          to,
          subject: `${input.attackerName} is attacking your empire`,
          intro: `${input.attackerName} launched an attack against your empire.`,
          detail: `Target tile: ${input.x}, ${input.y}.`,
          // Deep-links straight to the targeted tile: readUrlTileFocus() in
          // client-camera-storage.ts (packages/client) picks up ?x=&y= on
          // boot and centers the camera there instead of the player's home tile.
          linkUrl: `${appUrl}/?x=${input.x}&y=${input.y}`,
          linkLabel: "Go to tile"
        })
      );
    },
    sendSeasonStartAlert(input) {
      const isPreviousWinner = input.isPreviousWinner === true;
      return send(
        input.recipientPlayerId,
        (to) =>
          formatSeasonMessage({
            to,
            subject: isPreviousWinner ? "You won the season — and a new one has begun in Border Empires" : "A new season has begun in Border Empires",
            eyebrow: isPreviousWinner ? "Border Empires — Season Recap" : "Border Empires",
            headline: isPreviousWinner ? "Victory Is Yours" : "A New Season Has Begun",
            body: isPreviousWinner
              ? [
                  "Your empire outbuilt, outmaneuvered, and outlasted every rival on the map.",
                  input.objectiveName
                    ? `You claimed victory through ${input.objectiveName}, and your name is now etched into this season's history.`
                    : "Your name is now etched into this season's history.",
                  "The map has already reset for a new season — come defend your title before your rivals stake their claim.",
                  "Last season's final stats — yours, your allies', and your rivals' — are ready to browse on the season recap screen."
                ]
              : [
                  "The map has been reset, borders are undrawn, and every empire starts from the same first tile again.",
                  "Claim your territory early, forge alliances, and build toward this season's objective before your rivals do.",
                  "Curious how last season shook out? The recap screen now shows final stats for you and every friend or foe you played against."
                ],
            ...(isPreviousWinner
              ? { highlight: { label: "Status", value: "Season Champion" } }
              : input.previousWinnerName
                ? { highlight: { label: "Reigning Champion", value: input.previousWinnerName } }
                : {}),
            linkLabel: isPreviousWinner ? "Defend Your Title" : "Start Your Empire"
          }),
        { bypassRateLimit: true }
      );
    }
  };
};
