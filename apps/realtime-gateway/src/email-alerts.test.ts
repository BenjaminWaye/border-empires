import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "./auth-binding-store.js";
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

  it("throttles total alerts per recipient per day", async () => {
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
    await expect(alerts.sendTruceRequestAlert({ recipientPlayerId: "player-1", senderName: "Valka", durationHours: 12 })).resolves.toBe("sent");
    await expect(alerts.sendAllianceRequestAlert({ recipientPlayerId: "player-1", senderName: "Beejac" })).resolves.toBe("sent");
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "IronFist", x: 3, y: 4 })).resolves.toBe("throttled");
    expect(sent).toBe(3);

    currentTime = Date.UTC(2026, 4, 15, 1);
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "IronFist", x: 3, y: 4 })).resolves.toBe("sent");
    expect(sent).toBe(4);
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
});
