import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { createEmailAlertService } from "../email-alerts/email-alerts.js";
import type { EmailMessage } from "../email-alerts/email-branded-template.js";
import { InMemoryGatewayPlayerProfileStore } from "../player-profile-store/player-profile-store.js";
import { registerEmailUnsubscribeRoutes } from "./email-unsubscribe-routes.js";
import { createEmailUnsubscribeSigner, resolveEmailUnsubscribeSecret } from "./email-unsubscribe-token.js";

const APP_URL = "https://play.example";
const SECRET = "test-unsubscribe-secret";

const setup = async (options: { unsubscribeSecret?: string } = { unsubscribeSecret: SECRET }) => {
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
  const profileStore = new InMemoryGatewayPlayerProfileStore();
  const sent: EmailMessage[] = [];
  const alerts = createEmailAlertService({
    authBindingStore,
    profileStore,
    transport: { send: async (message) => { sent.push(message); } },
    appUrl: APP_URL,
    ...options
  });
  const app = Fastify();
  const invalidated: string[] = [];
  registerEmailUnsubscribeRoutes(app, {
    signer: createEmailUnsubscribeSigner(SECRET),
    appUrl: APP_URL,
    profileStore,
    invalidateProfileCache: (playerId) => invalidated.push(playerId)
  });
  await app.ready();
  return { alerts, app, profileStore, sent, invalidated };
};

const pathOf = (url: string): string => url.slice(APP_URL.length);

describe("email unsubscribe", () => {
  it("adds a signed unsubscribe link and List-Unsubscribe headers to gameplay emails", async () => {
    const { alerts, sent } = await setup();
    await expect(alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1" })).resolves.toBe("sent");

    const message = sent[0]!;
    const unsubscribeUrl = createEmailUnsubscribeSigner(SECRET).url(APP_URL, "player-1", "seasonStart");
    expect(unsubscribeUrl).toMatch(/^https:\/\/play\.example\/email\/unsubscribe\?p=player-1&c=seasonStart&t=/);
    expect(message.headers).toEqual({
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    });
    expect(message.text).toContain(`Unsubscribe: ${unsubscribeUrl}`);
    expect(message.html).toContain(`href="${unsubscribeUrl.replace(/&/g, "&amp;")}"`);
  });

  it("links the season-start email to the reopenable recap it describes", async () => {
    const { alerts, sent } = await setup();
    await alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1", previousWinnerName: "Nauticus" });
    expect(sent[0]!.text).toContain(`View the last contest's recap: ${APP_URL}/?recap=last`);
    expect(sent[0]!.html).toContain(`href="${APP_URL}/?recap=last"`);
  });

  it("sends no unsubscribe link when no signing secret is available", async () => {
    const { alerts, sent } = await setup({});
    await alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1" });
    expect(sent[0]!.headers).toBeUndefined();
    expect(sent[0]!.text).not.toContain("Unsubscribe");
  });

  it("forwards the unsubscribe headers to Resend", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    const bodies: Array<{ headers?: Record<string, string> }> = [];
    const alerts = createEmailAlertService({
      authBindingStore,
      resendApiKey: "re_test",
      from: "Border Empires <alerts@example.com>",
      appUrl: APP_URL,
      fetchImpl: (async (_url: string, init: { body: string }) => {
        bodies.push(JSON.parse(init.body) as { headers?: Record<string, string> });
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch
    });
    await expect(alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1" })).resolves.toBe("sent");
    // No dedicated secret: the signer falls back to a key derived from the Resend API key.
    const derived = createEmailUnsubscribeSigner(resolveEmailUnsubscribeSecret({ resendApiKey: "re_test" })!);
    expect(bodies[0]!.headers?.["List-Unsubscribe"]).toBe(`<${derived.url(APP_URL, "player-1", "seasonStart")}>`);
  });

  it("shows a confirmation page on GET without changing preferences", async () => {
    const { app, profileStore } = await setup();
    const url = createEmailUnsubscribeSigner(SECRET).url(APP_URL, "player-1", "seasonStart");
    const response = await app.inject({ method: "GET", url: pathOf(url) });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Unsubscribe from New Sector Contest emails");
    expect(response.body).toContain("Unsubscribe from all gameplay emails");
    expect((await profileStore.get("player-1"))?.emailNotificationPrefs).toBeUndefined();
  });

  it("rejects a tampered token", async () => {
    const { app, profileStore } = await setup();
    const url = createEmailUnsubscribeSigner(SECRET).url(APP_URL, "player-1", "seasonStart").replace("p=player-1", "p=player-2");
    const response = await app.inject({ method: "POST", url: pathOf(url) });
    expect(response.statusCode).toBe(400);
    expect(await profileStore.get("player-2")).toBeUndefined();
  });

  it("turns off the email's category via an RFC 8058 one-click POST, so the next email is not sent", async () => {
    const { alerts, app, profileStore, sent, invalidated } = await setup();
    await alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1" });
    const url = /<(.+)>/.exec(sent[0]!.headers!["List-Unsubscribe"]!)![1]!;

    const response = await app.inject({
      method: "POST",
      url: pathOf(url),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: "List-Unsubscribe=One-Click"
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("You're unsubscribed");
    expect((await profileStore.get("player-1"))?.emailNotificationPrefs).toEqual({ seasonStart: false });
    expect(invalidated).toEqual(["player-1"]);
    await expect(alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1" })).resolves.toBe("disabled");
    // Other categories keep sending.
    await expect(alerts.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: "Milo" })).resolves.toBe("sent");
  });

  it("turns off every gameplay email category for the all scope", async () => {
    const { app, profileStore } = await setup();
    const url = createEmailUnsubscribeSigner(SECRET).url(APP_URL, "player-1", "all");
    const response = await app.inject({ method: "POST", url: pathOf(url) });
    expect(response.statusCode).toBe(200);
    const prefs = (await profileStore.get("player-1"))?.emailNotificationPrefs ?? {};
    expect(Object.values(prefs)).toHaveLength(8);
    expect(Object.values(prefs).every((value) => value === false)).toBe(true);
  });
});
