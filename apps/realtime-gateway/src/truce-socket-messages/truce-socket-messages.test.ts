import { describe, expect, it, vi } from "vitest";
import type { ClientMessage } from "@border-empires/shared";

import { handleTruceSocketMessage, type TruceSocketMessageDeps } from "./truce-socket-messages.js";
import { handleAllianceSocketMessage, type AllianceSocketMessageDeps } from "../alliance-socket-messages/alliance-socket-messages.js";

const okResult = { ok: true as const, notifyPlayerIds: ["p1", "p2"], payloadsByPlayerId: new Map<string, unknown[]>() };
const failResult = { ok: false as const, code: "NOPE", message: "nope" };
const socket = {} as import("ws").WebSocket;

const truceDeps = (overrides: Partial<TruceSocketMessageDeps>): TruceSocketMessageDeps => ({
  requestTruce: () => okResult, acceptTruce: () => okResult, rejectTruce: () => okResult, cancelTruce: () => okResult, breakTruce: () => okResult,
  syncPlayers: () => ({ payloadsByPlayerId: new Map() }), takeStaleOfferSync: () => undefined,
  sendJson: vi.fn(), fanoutPlayerPayloads: vi.fn(), syncTruceToSimulation: vi.fn(async () => true),
  maybeAutoRespondToSeededAiTruce: vi.fn(async () => {}), sendGameplayEmailAlert: vi.fn(),
  sendTruceRequestAlert: vi.fn(async () => ({ sent: false }) as unknown as Awaited<ReturnType<TruceSocketMessageDeps["sendTruceRequestAlert"]>>),
  ...overrides
});

const allianceDeps = (overrides: Partial<AllianceSocketMessageDeps>): AllianceSocketMessageDeps => ({
  requestAlliance: () => okResult, acceptAlliance: () => okResult, rejectAlliance: () => okResult, cancelAlliance: () => okResult, breakAlliance: () => okResult,
  sendJson: vi.fn(), fanoutPlayerPayloads: vi.fn(), syncAllianceToSimulation: vi.fn(async () => true), sendGameplayEmailAlert: vi.fn(),
  maybeAutoRespondToSeededAiAlliance: vi.fn(async () => {}),
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

describe("stale truce offer resync", () => {
  const invalid = { ok: false as const, code: "TRUCE_REQUEST_INVALID", message: "request invalid or expired" };

  it.each(["TRUCE_ACCEPT", "TRUCE_REJECT", "TRUCE_CANCEL"] as const)("%s on a dropped offer sends the error, then the actor's fresh state", async (type) => {
    const sent: string[] = [];
    const resync = new Map<string, unknown[]>([["p1", [{ type: "TRUCE_UPDATE", incomingTruceRequests: [] }]]]);
    const syncPlayers = vi.fn(() => ({ payloadsByPlayerId: resync }));
    const deps = truceDeps({
      sendJson: vi.fn((_socket, payload: unknown) => { sent.push((payload as { type: string }).type); }),
      fanoutPlayerPayloads: vi.fn((payloads: Map<string, unknown[]>) => { sent.push(payloads === resync ? "resync" : "other"); }),
      syncPlayers, acceptTruce: () => invalid, rejectTruce: () => invalid, cancelTruce: () => invalid
    });
    await handleTruceSocketMessage(deps, { type, requestId: "stale" } as ClientMessage, "p1", socket);
    expect(syncPlayers).toHaveBeenCalledWith(["p1"]);
    expect(sent).toEqual(["ERROR", "resync"]);
  });

  it("also flushes the other side of an offer a failed accept just deleted", async () => {
    const fanoutPlayerPayloads = vi.fn();
    const stale = new Map<string, unknown[]>([["p2", [{ type: "TRUCE_UPDATE", outgoingTruceRequests: [] }]]]);
    const lockedOut = { ok: false as const, code: "TRUCE_LOCKED_OUT", message: "one player broke a truce recently and is locked out" };
    const deps = truceDeps({ fanoutPlayerPayloads, acceptTruce: () => lockedOut, takeStaleOfferSync: () => ({ payloadsByPlayerId: stale }) });
    await handleTruceSocketMessage(deps, { type: "TRUCE_ACCEPT", requestId: "r1" } as ClientMessage, "p1", socket);
    expect(fanoutPlayerPayloads).toHaveBeenLastCalledWith(stale);
  });

  it("does not resync on failures that say nothing about a stale offer", async () => {
    const syncPlayers = vi.fn(() => ({ payloadsByPlayerId: new Map() }));
    const settling = { ok: false as const, code: "OFFER_SETTLING", message: "That offer is being settled right now." };
    await handleTruceSocketMessage(truceDeps({ syncPlayers, acceptTruce: () => settling }), { type: "TRUCE_ACCEPT", requestId: "r1" } as ClientMessage, "p1", socket);
    expect(syncPlayers).not.toHaveBeenCalled();
  });

  it("does not resync after a successful accept beyond the normal fanout", async () => {
    const syncPlayers = vi.fn(() => ({ payloadsByPlayerId: new Map() }));
    await handleTruceSocketMessage(truceDeps({ syncPlayers }), { type: "TRUCE_ACCEPT", requestId: "r1" } as ClientMessage, "p1", socket);
    expect(syncPlayers).not.toHaveBeenCalled();
  });
});
