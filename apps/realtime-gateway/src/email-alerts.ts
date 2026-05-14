import type { GatewayAuthBindingStore } from "./auth-binding-store.js";
import { unwrapPayloadSource } from "./broadcast-payload.js";

export type EmailAlertConfig = {
  resendApiKey?: string;
  from?: string;
  replyTo?: string;
  appUrl?: string;
  dailyLimit?: number;
};

export type EmailAlertService = {
  sendAllianceRequestAlert: (input: SocialRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendTruceRequestAlert: (input: TruceRequestAlertInput) => Promise<EmailAlertOutcome>;
  sendAttackAlert: (input: AttackAlertInput) => Promise<EmailAlertOutcome>;
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

  const send = async (recipientPlayerId: string, build: (email: string) => EmailMessage): Promise<EmailAlertOutcome> => {
    if (!transport) return "disabled";
    const binding = await options.authBindingStore.getByPlayerId(recipientPlayerId);
    const email = normalizeEmail(binding?.email);
    if (!email) return "recipient_missing";

    const sentAt = now();
    const today = dayKey(sentAt);
    const counter = countersByEmail.get(email);
    const sentToday = counter?.day === today ? counter.sent : 0;
    if (sentToday >= dailyLimit) return "throttled";
    if (counter && sentAt - counter.lastSentAt < MIN_SEND_INTERVAL_MS) return "throttled";
    countersByEmail.set(email, { day: today, sent: sentToday + 1, lastSentAt: sentAt });

    try {
      await transport.send(build(email));
      return "sent";
    } catch (error) {
      if (counter) {
        countersByEmail.set(email, counter);
      } else {
        countersByEmail.delete(email);
      }
      options.log?.error?.(
        { err: error instanceof Error ? error.message : String(error), recipientPlayerId },
        "failed to send gameplay email alert"
      );
      return "send_failed";
    }
  };

  const formatMessage = (input: { to: string; subject: string; intro: string; detail: string }): EmailMessage => {
    const safeIntro = escapeHtml(input.intro);
    const safeDetail = escapeHtml(input.detail);
    const safeAppUrl = escapeHtml(appUrl);
    return {
      to: input.to,
      subject: input.subject,
      text: `${input.intro}\n\n${input.detail}\n\nOpen Border Empires: ${appUrl}`,
      html: `<p>${safeIntro}</p><p>${safeDetail}</p><p><a href="${safeAppUrl}">Open Border Empires</a></p>`
    };
  };

  return {
    sendAllianceRequestAlert(input) {
      return send(input.recipientPlayerId, (to) =>
        formatMessage({
          to,
          subject: `${input.senderName} sent you an alliance request`,
          intro: `${input.senderName} sent your empire an alliance request.`,
          detail: "Open Border Empires to accept or reject it."
        })
      );
    },
    sendTruceRequestAlert(input) {
      return send(input.recipientPlayerId, (to) =>
        formatMessage({
          to,
          subject: `${input.senderName} offered you a ${input.durationHours}h truce`,
          intro: `${input.senderName} offered your empire a ${input.durationHours}h truce.`,
          detail: "Open Border Empires to accept or reject it before the offer expires."
        })
      );
    },
    sendAttackAlert(input) {
      return send(input.defenderPlayerId, (to) =>
        formatMessage({
          to,
          subject: `${input.attackerName} is attacking your empire`,
          intro: `${input.attackerName} launched an attack against your empire.`,
          detail: `Target tile: ${input.x}, ${input.y}.`
        })
      );
    }
  };
};
