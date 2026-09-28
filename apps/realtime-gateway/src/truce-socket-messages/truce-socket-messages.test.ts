import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@border-empires/shared";

import { handleTruceSocketMessage, type TruceSocketMessageDeps } from "./truce-socket-messages.js";
import { handleAllianceSocketMessage, type AllianceSocketMessageDeps } from "../alliance-socket-messages/alliance-socket-messages.js";

const okResult = { ok: true as const, notifyPlayerIds: ["p1", "p2"], payloadsByPlayerId: new Map<string, unknown[]>() };
const failResult = { ok: false as const, code: "NOPE", message: "nope" };
const socket = {} as import("ws").WebSocket;

const truceDeps = (overrides: Partial<TruceSocketMessageDeps>): TruceSocketMessageDeps => ({
  requestTruce: () => okResult, acceptTruce: () => okResult, rejectTruce: () => okResult, cancelTruce: () => okResult, breakTruce: () => okResult,
  sendJson: vi.fn(), fanoutPlayerPayloads: vi.fn(), syncTruceToSimulation: vi.fn(async () => true),
  maybeAutoRespondToSeededAiTruce: vi.fn(async () => {}), sendGameplayEmailAlert: vi.fn(),
  sendTruceRequestAlert: vi.fn(async () => ({ sent: false }) as unknown as Awaited<ReturnType<TruceSocketMessageDeps["sendTruceRequestAlert"]>>),
  ...overrides
});

const allianceDeps = (overrides: Partial<AllianceSocketMessageDeps>): AllianceSocketMessageDeps => ({
  requestAlliance: () => okResult, acceptAlliance: () => okResult, rejectAlliance: () => okResult, cancelAlliance: () => okResult, breakAlliance: () => okResult,
  sendJson: vi.fn(), fanoutPlayerPayloads: vi.fn(), syncAllianceToSimulation: vi.fn(async () => true), sendGameplayEmailAlert: vi.fn(),
  sendAllianceRequestAlert: vi.fn(async () => ({ sent: false }) as unknown as Awaited<ReturnType<AllianceSocketMessageDeps["sendAllianceRequestAlert"]>>),
  sendAllianceBreakAlert: vi.fn(async () => ({ sent: false }) as unknown as Awaited<ReturnType<AllianceSocketMessageDeps["sendAllianceBreakAlert"]>>),
  ...overrides
});

describe("diplomacy player-funnel hook", () => {
  it("fires for successful truce requests and accepts with the other player's id", async () => {
    const onDiplomacyInteraction = vi.fn();
    await handleTruceSocketMessage(truceDeps({ onDiplomacyInteraction }), { type: "TRUCE_REQUEST", targetPlayerName: "Bob", durationHours: 12 } as ClientMessage, "p1", socket);
    await handleTruceSocketMessage(truceDeps({ onDiplomacyInteraction }), { type: "TRUCE_ACCEPT", requestId: "r1" } as ClientMessage, "p1", socket);
    expect(onDiplomacyInteraction.mock.calls).toEqual([["p1", "p2"], ["p1", "p2"]]);
  });

  it("does not fire for failed or non-request truce messages", async () => {
    const onDiplomacyInteraction = vi.fn();
    await handleTruceSocketMessage(truceDeps({ onDiplomacyInteraction, requestTruce: () => failResult }), { type: "TRUCE_REQUEST", targetPlayerName: "Bob", durationHours: 12 } as ClientMessage, "p1", socket);
    await handleTruceSocketMessage(truceDeps({ onDiplomacyInteraction }), { type: "TRUCE_REJECT", requestId: "r1" } as ClientMessage, "p1", socket);
    expect(onDiplomacyInteraction).not.toHaveBeenCalled();
  });

  it("fires for successful alliance requests and accepts", async () => {
    const onDiplomacyInteraction = vi.fn();
    await handleAllianceSocketMessage(allianceDeps({ onDiplomacyInteraction }), { type: "ALLIANCE_REQUEST", targetPlayerName: "Bob" } as ClientMessage, "p1", socket);
    await handleAllianceSocketMessage(allianceDeps({ onDiplomacyInteraction }), { type: "ALLIANCE_ACCEPT", requestId: "r1" } as ClientMessage, "p1", socket);
    await handleAllianceSocketMessage(allianceDeps({ onDiplomacyInteraction }), { type: "ALLIANCE_BREAK", targetPlayerId: "p2" } as ClientMessage, "p1", socket);
    expect(onDiplomacyInteraction.mock.calls).toEqual([["p1", "p2"], ["p1", "p2"]]);
  });
});
