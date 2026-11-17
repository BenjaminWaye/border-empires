import { describe, expect, it } from "vitest";

import { InMemoryGatewayAuthBindingStore } from "../auth-binding-store/auth-binding-store.js";
import { createEmailAlertService } from "./email-alerts.js";

const NOW = Date.UTC(2026, 10, 17, 20, 0);

const setup = async (prefs: Record<string, Record<string, boolean>> = {}) => {
  const authBindingStore = new InMemoryGatewayAuthBindingStore(() => 1_000);
  await authBindingStore.bindIdentity({ uid: "uid-1", playerId: "player-1", email: "player@example.com" });
  const sent: Array<{ subject: string; text: string }> = [];
  const alerts = createEmailAlertService({
    authBindingStore,
    // @ts-expect-error -- test double only implements the one method email-alerts.ts reads.
    profileStore: { get: async (playerId: string) => (prefs[playerId] ? { emailNotificationPrefs: prefs[playerId] } : undefined) },
    transport: { send: async (message) => void sent.push(message) },
    appUrl: "https://play.example",
    now: () => NOW
  });
  return { alerts, sent };
};

describe("truce-ending email", () => {
  it("names the other side, the end time and links to the game", async () => {
    const { alerts, sent } = await setup();
    await expect(alerts.sendTruceEndingAlert({ recipientPlayerId: "player-1", otherPartyName: "Vorn", endsAt: NOW + 58 * 60_000 })).resolves.toBe("sent");
    expect(sent[0]?.subject).toBe("Your truce with Vorn ends in about 58 minutes");
    expect(sent[0]?.text).toContain("ends at 20:58 UTC");
    expect(sent[0]?.text).toContain("https://play.example");
  });

  it("is not held back by the hourly throttle after another alert", async () => {
    const { alerts } = await setup();
    await expect(alerts.sendAttackAlert({ defenderPlayerId: "player-1", attackerName: "Vorn", x: 1, y: 2 })).resolves.toBe("sent");
    await expect(alerts.sendTruceEndingAlert({ recipientPlayerId: "player-1", otherPartyName: "Vorn", endsAt: NOW + 60 * 60_000 })).resolves.toBe("sent");
  });

  it("honors its own opt-out", async () => {
    const { alerts, sent } = await setup({ "player-1": { truceEnding: false } });
    await expect(alerts.sendTruceEndingAlert({ recipientPlayerId: "player-1", otherPartyName: "Vorn", endsAt: NOW + 60 * 60_000 })).resolves.toBe("disabled");
    expect(sent).toHaveLength(0);
  });
});

describe("empire-fell email", () => {
  it("says who took the empire and links to the new start", async () => {
    const { alerts, sent } = await setup();
    await expect(alerts.sendEmpireFellAlert({ recipientPlayerId: "player-1", captorName: "Vorn", x: 41, y: 7 })).resolves.toBe("sent");
    expect(sent[0]?.subject).toBe("Your empire fell in Border Empires");
    expect(sent[0]?.text).toContain("Your empire fell to Vorn.");
    expect(sent[0]?.text).toContain("You've been given a new start at 41, 7.");
    expect(sent[0]?.text).toContain("https://play.example/?x=41&y=7");
  });

  it("honors its own opt-out", async () => {
    const { alerts } = await setup({ "player-1": { empireFell: false } });
    await expect(alerts.sendEmpireFellAlert({ recipientPlayerId: "player-1", x: 1, y: 1 })).resolves.toBe("disabled");
  });
});
