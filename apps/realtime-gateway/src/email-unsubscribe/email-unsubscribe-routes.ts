import type { FastifyInstance, FastifyReply } from "fastify";
import { EMAIL_NOTIFICATION_CATEGORIES } from "../gateway-app/handle-set-email-notification-prefs-message.js";
import type { EmailNotificationCategory, EmailNotificationPrefs } from "../player-profile-store/player-profile-store.js";
import { escapeHtml } from "../email-alerts/escape-html.js";
import { EMAIL_UNSUBSCRIBE_PATH, type EmailUnsubscribeScope, type EmailUnsubscribeSigner } from "./email-unsubscribe-token.js";

export type EmailUnsubscribeRouteDeps = {
  signer: EmailUnsubscribeSigner;
  appUrl: string;
  profileStore: {
    setEmailNotificationPrefs: (playerId: string, patch: EmailNotificationPrefs) => Promise<unknown>;
  };
  invalidateProfileCache?: (playerId: string) => void;
};

// Mirrors the client's Email Notifications settings labels.
const CATEGORY_LABELS: Record<EmailNotificationCategory, string> = {
  allianceRequest: "Alliance Request",
  allianceBreak: "Alliance Break",
  truceOffer: "Truce Offer",
  attackAlert: "Attack",
  aetherPurgeAlert: "Aether Purge",
  aetherHijackAlert: "Tower Hijack",
  seasonStart: "New Sector Contest",
  manpowerFull: "Manpower Full"
};

type UnsubscribeQuery = { p?: unknown; c?: unknown; t?: unknown };
type ParsedRequest = { playerId: string; scope: EmailUnsubscribeScope };

const isCategory = (value: string): value is EmailNotificationCategory =>
  (EMAIL_NOTIFICATION_CATEGORIES as readonly string[]).includes(value);

export const parseUnsubscribeQuery = (query: UnsubscribeQuery, signer: EmailUnsubscribeSigner): ParsedRequest | undefined => {
  const playerId = typeof query.p === "string" ? query.p : "";
  const token = typeof query.t === "string" ? query.t : "";
  const rawScope = typeof query.c === "string" ? query.c : "all";
  if (!signer.verify(playerId, token)) return undefined;
  if (rawScope !== "all" && !isCategory(rawScope)) return undefined;
  return { playerId, scope: rawScope };
};

export const unsubscribePatch = (scope: EmailUnsubscribeScope): EmailNotificationPrefs => {
  const patch: EmailNotificationPrefs = {};
  for (const category of EMAIL_NOTIFICATION_CATEGORIES) {
    if (scope === "all" || scope === category) patch[category] = false;
  }
  return patch;
};

const scopeLabel = (scope: EmailUnsubscribeScope): string =>
  scope === "all" ? "all Border Empires gameplay emails" : `${CATEGORY_LABELS[scope]} emails`;

const page = (title: string, bodyHtml: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${escapeHtml(title)} — Border Empires</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0d14; color: #cbd2de; font: 400 15px/1.6 "Segoe UI", Arial, sans-serif; padding: 16px; box-sizing: border-box; }
      main { max-width: 480px; width: 100%; background: #141826; border: 1px solid #262c40; border-radius: 14px; padding: 32px; box-sizing: border-box; text-align: center; }
      h1 { font: 700 24px/1.3 Georgia, "Times New Roman", serif; color: #f3d98b; margin: 0 0 16px; }
      form { margin: 12px 0 0; }
      button { width: 100%; padding: 14px 20px; border-radius: 8px; border: 0; font: 700 14px/1 "Segoe UI", Arial, sans-serif; cursor: pointer; }
      .primary { background: #c8952f; color: #1a1305; }
      .secondary { background: transparent; color: #cbd2de; border: 1px solid #3a4360; }
      a { color: #e0b84a; }
    </style>
  </head>
  <body><main>${bodyHtml}</main></body>
</html>`;

const actionUrl = (signer: EmailUnsubscribeSigner, playerId: string, scope: EmailUnsubscribeScope): string =>
  escapeHtml(signer.url("", playerId, scope));

const sendPage = (reply: FastifyReply, status: number, html: string): FastifyReply =>
  reply.code(status).header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(html);

const invalidLinkPage = (appUrl: string): string =>
  page("Link not valid", `<h1>This link isn't valid</h1>
    <p>It may have been copied incompletely. You can still turn emails off in Border Empires under <strong>Settings → Email Notifications</strong>.</p>
    <p><a href="${escapeHtml(appUrl)}">Open Border Empires</a></p>`);

export const registerEmailUnsubscribeRoutes = (app: FastifyInstance, deps: EmailUnsubscribeRouteDeps): void => {
  // Encapsulated so the catch-all body parser below only applies here: RFC 8058
  // one-click POSTs arrive as form-encoded "List-Unsubscribe=One-Click", and
  // the confirmation page's own forms post an empty form body. Every input
  // the route needs is in the signed query string, so the body is ignored.
  void app.register(async (scope) => {
    scope.addContentTypeParser("*", { parseAs: "string" }, (_request, _body, done) => done(null, undefined));

    scope.get(EMAIL_UNSUBSCRIBE_PATH, async (request, reply) => {
      const parsed = parseUnsubscribeQuery(request.query as UnsubscribeQuery, deps.signer);
      if (!parsed) return sendPage(reply, 400, invalidLinkPage(deps.appUrl));
      const allButton = parsed.scope === "all" ? "" : `
        <form method="post" action="${actionUrl(deps.signer, parsed.playerId, "all")}">
          <button class="secondary" type="submit">Unsubscribe from all gameplay emails</button>
        </form>`;
      return sendPage(reply, 200, page("Unsubscribe", `<h1>Unsubscribe?</h1>
        <p>Stop receiving ${escapeHtml(scopeLabel(parsed.scope))}?</p>
        <form method="post" action="${actionUrl(deps.signer, parsed.playerId, parsed.scope)}">
          <button class="primary" type="submit">Unsubscribe from ${escapeHtml(scopeLabel(parsed.scope))}</button>
        </form>${allButton}
        <p>You can change this any time in Border Empires under <strong>Settings → Email Notifications</strong>.</p>`));
    });

    scope.post(EMAIL_UNSUBSCRIBE_PATH, async (request, reply) => {
      const parsed = parseUnsubscribeQuery(request.query as UnsubscribeQuery, deps.signer);
      if (!parsed) return sendPage(reply, 400, invalidLinkPage(deps.appUrl));
      await deps.profileStore.setEmailNotificationPrefs(parsed.playerId, unsubscribePatch(parsed.scope));
      deps.invalidateProfileCache?.(parsed.playerId);
      return sendPage(reply, 200, page("Unsubscribed", `<h1>You're unsubscribed</h1>
        <p>You won't receive ${escapeHtml(scopeLabel(parsed.scope))} any more.</p>
        <p>To turn them back on, open Border Empires and go to <strong>Settings → Email Notifications</strong>.</p>
        <p><a href="${escapeHtml(deps.appUrl)}">Open Border Empires</a></p>`));
    });
  });
};
