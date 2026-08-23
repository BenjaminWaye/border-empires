import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import {
  createEmailAlertService,
  readAttackAlert,
  readIncomingAllianceRequestAlert,
  readIncomingTruceRequestAlert
} from "./email-alerts.js";

describe("email alerts", () => {
  it("sends gameplay alerts to the latest bound player email", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "Player@One.Example" });
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async (message) => {
          sent.push(message);
        }
      },
      appUrl: "https://play.example"
    });

    await expect(
      alerts.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: "Nauticus" })
    ).resolves.toBe("sent");

    expect(sent).toEqual([
      expect.objectContaining({
        to: "player@one.example",
        subject: "Nauticus sent you an alliance request",
        text: expect.stringContaining("https://play.example")
      })
    ]);
  });

  it("links attack alerts straight to the targeted tile", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async (message) => {
          sent.push(message);
        }
      },
      appUrl: "https://play.example"
    });

    await expect(
      alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Milo Ash", x: 141, y: 174 })
    ).resolves.toBe("sent");

    expect(sent).toEqual([
      expect.objectContaining({
        text: expect.stringContaining("Go to tile: https://play.example/?x=141&y=174"),
        html: expect.stringContaining('<a href="https://play.example/?x=141&amp;y=174">Go to tile</a>')
      })
    ]);
  });

  it("throttles attack alerts per recipient by hour and by day", async () => {
    let currentTime = Date.UTC(2026, 4, 14, 12);
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => currentTime);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    let sent = 0;
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async () => {
          sent += 1;
        }
      },
      dailyLimit: 3,
      now: () => currentTime
    });

    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })).resolves.toBe("sent");
    currentTime += 59 * 60 * 1_000;
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })).resolves.toBe("throttled");
    currentTime += 60 * 1_000;
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })).resolves.toBe("sent");
    currentTime += 60 * 60 * 1_000;
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })).resolves.toBe("sent");
    currentTime += 60 * 60 * 1_000;
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "IronFist", x: 3, y: 4 })).resolves.toBe("throttled");
    expect(sent).toBe(3);

    currentTime = Date.UTC(2026, 4, 15, 1);
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "IronFist", x: 3, y: 4 })).resolves.toBe("sent");
    expect(sent).toBe(4);
  });

  it("bypasses rate limits for alliance and truce requests and does not consume the attack budget", async () => {
    let currentTime = Date.UTC(2026, 4, 14, 12);
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => currentTime);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    let sent = 0;
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async () => {
          sent += 1;
        }
      },
      dailyLimit: 3,
      now: () => currentTime
    });

    for (let index = 0; index < 6; index += 1) {
      await expect(
        alerts.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: `Sender${index}` })
      ).resolves.toBe("sent");
      await expect(
        alerts.sendTruceRequestAlert({ recipientPlayerId: "player-1", senderName: `Sender${index}`, durationHours: 12 })
      ).resolves.toBe("sent");
    }
    expect(sent).toBe(12);

    await expect(
      alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })
    ).resolves.toBe("sent");
    expect(sent).toBe(13);
    await expect(
      alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Valka", x: 1, y: 2 })
    ).resolves.toBe("throttled");
    expect(sent).toBe(13);
  });

  it("skips delivery when alerts are disabled or no recipient email is known", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore();
    const disabled = createEmailAlertService({ authBindingStore });
    await expect(
      disabled.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: "Nauticus" })
    ).resolves.toBe("disabled");

    const enabled = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async () => {
          throw new Error("should not send");
        }
      }
    });
    await expect(
      enabled.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: "Nauticus" })
    ).resolves.toBe("recipient_missing");
  });

  it("sends a branded season-start email crediting the previous champion", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async (message) => {
          sent.push(message);
        }
      },
      appUrl: "https://play.example"
    });

    await expect(
      alerts.sendSeasonStartAlert({ recipientPlayerId: "player-1", previousWinnerName: "Nauticus" })
    ).resolves.toBe("sent");

    expect(sent).toEqual([
      expect.objectContaining({
        to: "player@example.com",
        subject: "A new season has begun in Border Empires",
        html: expect.stringContaining("Reigning Champion"),
        text: expect.stringContaining("Reigning Champion: Nauticus")
      })
    ]);
    expect(sent[0]?.html).toContain("Nauticus");
    expect(sent[0]?.html).toContain("https://play.example");
  });

  it("folds a victory recap into the season-start email for the previous winner", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
    const sent: Array<{ to: string; subject: string; text: string; html: string }> = [];
    const alerts = createEmailAlertService({
      authBindingStore,
      transport: {
        send: async (message) => {
          sent.push(message);
        }
      },
      appUrl: "https://play.example"
    });

    await expect(
      alerts.sendSeasonStartAlert({
        recipientPlayerId: "player-1",
        isPreviousWinner: true,
        objectiveName: "Continental Dominance"
      })
    ).resolves.toBe("sent");

    expect(sent).toEqual([
      expect.objectContaining({
        to: "player@example.com",
        subject: "You won the season — and a new one has begun in Border Empires",
        text: expect.stringContaining("Continental Dominance")
      })
    ]);
  });

  it("extracts alert details from social and attack payloads", () => {
    expect(
      readIncomingAllianceRequestAlert(
        new Map([
          [
            "player-2",
            [
              {
                type: "ALLIANCE_REQUEST_INCOMING",
                fromName: "Nauticus",
                request: { fromPlayerId: "player-1", toPlayerId: "player-2" }
              }
            ]
          ]
        ])
      )
    ).toEqual({ recipientPlayerId: "player-2", senderName: "Nauticus" });

    expect(
      readIncomingTruceRequestAlert(
        new Map([
          [
            "player-2",
            [
              {
                type: "TRUCE_REQUEST_INCOMING",
                fromName: "Valka",
                request: { toPlayerId: "player-2", durationHours: 24 }
              }
            ]
          ]
        ])
      )
    ).toEqual({ recipientPlayerId: "player-2", senderName: "Valka", durationHours: 24 });

    expect(readAttackAlert({ type: "ATTACK_ALERT", attackerName: "IronFist", x: 3, y: 4 })).toEqual({
      attackerName: "IronFist",
      x: 3,
      y: 4
    });
  });

  it("emails a player bug report straight to the fixed admin inbox via Resend", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const alerts = createEmailAlertService({
      authBindingStore,
      resendApiKey: "test-key",
      from: "Border Empires <alerts@borderempires.com>",
      bugReportEmailTo: "bw199005@gmail.com",
      fetchImpl
    });

    alerts.sendBugReportAlert({
      description: "The map froze after placing a fort",
      playerName: "Nauticus",
      playerId: "player-1",
      clientEvents: [],
      serverEvents: [],
      clientContext: {},
      metadata: {}
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual([
      {
        url: "https://api.resend.com/emails",
        body: expect.objectContaining({
          to: ["bw199005@gmail.com"],
          subject: expect.stringContaining("Nauticus"),
          text: expect.stringContaining("The map froze after placing a fort")
        })
      }
    ]);
  });

  it("does not send a bug report email when no Resend API key is configured", async () => {
    const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const alerts = createEmailAlertService({ authBindingStore, fetchImpl });

    alerts.sendBugReportAlert({
      description: "desc",
      playerName: "Nauticus",
      playerId: "player-1",
      clientEvents: [],
      serverEvents: [],
      clientContext: {},
      metadata: {}
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(called).toBe(false);
  });
});
