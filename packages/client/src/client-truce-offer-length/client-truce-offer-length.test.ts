// Playtest 2026-11-27 truce follow-ups: the truce an offer gives, the accept confirmation,
// a countered offer that stayed on screen, and Launch Attack during a truce.
import { describe, expect, it, vi } from "vitest";

import type { ActiveTruceView, TileActionDef, TileMenuView, TruceRequest } from "../client-types.js";
import { agreedTruces, offeredTruceLength, truceLengthLabel } from "./client-truce-offer-length.js";
import { offerDockEntries, offerDockHtml } from "../client-diplomacy-offer-dock/client-diplomacy-offer-dock.js";
import { diplomacyListHtml } from "../client-hud-v2/client-hud-v2-diplomacy.js";
import { applyTruceUpdateMessage } from "../client-diplomacy-notifications/client-diplomacy-notifications.js";
import { diplomacyTradeDepsFor } from "../client-diplomacy-trade/client-diplomacy-trade-deps.js";
import { BREAKS_TRUCE_NOTE, gateAttackRowsOnTruce } from "../client-pact-attack-gate/client-pact-attack-gate.js";
import { actionBarHtml, selectBarButtons } from "../client-hud-v2/client-hud-v2-action-bar.js";

const HOUR = 3_600_000;
// A 24h offer from Freja, sent at 0 and looked at 2h later.
const offer: TruceRequest = { id: "t1", fromPlayerId: "ai-1", toPlayerId: "me", createdAt: 0, expiresAt: 24 * HOUR, durationHours: 24, fromName: "Freja" };
const truce = (otherPlayerId: string, endsAt: number, extra: Partial<ActiveTruceView> = {}): ActiveTruceView =>
  ({ otherPlayerId, otherPlayerName: "Freja", startedAt: 0, endsAt, createdByPlayerId: otherPlayerId, ...extra });

describe("truce length labels", () => {
  it("rounds to whole hours and shows minutes under an hour", () => {
    expect(truceLengthLabel(22 * HOUR)).toBe("22h");
    expect(truceLengthLabel(21 * HOUR + 40 * 60_000)).toBe("22h");
    expect(truceLengthLabel(21 * HOUR + 20 * 60_000)).toBe("21h");
    expect(truceLengthLabel(40 * 60_000 + 1)).toBe("41m");
    expect(truceLengthLabel(59 * 60_000 + 30_000)).toBe("1h");
  });

  it("is the hours left of a new truce, nothing for an extension", () => {
    expect(offeredTruceLength(offer, 2 * HOUR)).toBe("22h");
    expect(offeredTruceLength({ ...offer, extendsTruce: true }, 2 * HOUR)).toBeUndefined();
  });
});

describe("accepting a truce offer says the truce you'd get", () => {
  it("offer dock: Accept 22h truce, and the confirm tap too", () => {
    const state = { me: "me", incomingTruceRequests: [offer], incomingAllianceRequests: [] };
    const entries = offerDockEntries(state, new Map(), new Set(), 0, () => 22 * HOUR);
    expect(offerDockHtml(entries)).toContain(">Accept 22h truce</button>");
    const paid = offerDockEntries({ ...state, incomingTruceRequests: [{ ...offer, terms: { give: { gold: 0 }, ask: { gold: 5 } } }] }, new Map(), new Set(), 0, () => 22 * HOUR);
    expect(offerDockHtml(paid, "t1")).toContain(">Confirm 22h truce</button>");
  });

  it("Diplomacy request row: Accept 22h truce", () => {
    const html = diplomacyListHtml({
      me: "me", metPlayerIds: new Set<string>(), allies: [], activeTruces: [], incomingAlliance: [], incomingTruce: [offer],
      leaderboard: [], nameOf: () => "Freja", colorOf: () => undefined, nowMs: 2 * HOUR
    });
    expect(html).toContain(">Accept 22h truce</button>");
  });
});

describe("truce agreed popup", () => {
  it("tells the player who accepted, with the truce they got", () => {
    const state = { activeTruces: [] as ActiveTruceView[], truceBreaksThisSeason: [], incomingTruceRequests: [offer], outgoingTruceRequests: [] };
    const deps = { pushFeed: vi.fn(), showCaptureAlert: vi.fn() };
    vi.useFakeTimers();
    vi.setSystemTime(2 * HOUR);
    applyTruceUpdateMessage(state, {
      activeTruces: [truce("ai-1", 24 * HOUR)], incomingTruceRequests: [], outgoingTruceRequests: [],
      announcement: "Me and Freja agreed to a 24h truce, counted from the offer: 22h 00m left."
    }, deps);
    vi.useRealTimers();
    expect(deps.showCaptureAlert).toHaveBeenCalledWith("Truce agreed", "Truce with Freja · 22h", "success");
  });

  it("leaves out unchanged truces and Court armistices", () => {
    const before = [truce("a", 10 * HOUR)];
    expect(agreedTruces(before, [truce("a", 10 * HOUR), truce("c", 12 * HOUR, { origin: "court" })])).toEqual([]);
    expect(agreedTruces(before, [truce("a", 20 * HOUR)])).toEqual([expect.objectContaining({ otherPlayerId: "a", extended: true })]);
  });
});

describe("countering an offer", () => {
  it("drops the countered offer once the counter is sent", () => {
    const state = { gold: 10, incomingTruceRequests: [offer, { ...offer, id: "t2" }], incomingAllianceRequests: [] as Array<{ id: string }> };
    const deps = diplomacyTradeDepsFor(state, () => true);
    deps.send({ type: "TRUCE_REQUEST", targetPlayerName: "Freja", durationHours: 24, counters: { kind: "truce", requestId: "t1" } }, "");
    expect(state.incomingTruceRequests.map((request) => request.id)).toEqual(["t2"]);
  });

  it("keeps it when the counter wasn't sent", () => {
    const state = { gold: 10, incomingTruceRequests: [offer] };
    diplomacyTradeDepsFor(state, () => false).send({ type: "TRUCE_REQUEST", counters: { kind: "truce", requestId: "t1" } }, "");
    expect(state.incomingTruceRequests).toHaveLength(1);
  });
});

describe("Launch Attack on a truced House", () => {
  const gatedView = (): TileMenuView => {
    const rows: TileActionDef[] = [{ id: "launch_attack", label: "Launch Attack", cost: "40 manpower" }];
    gateAttackRowsOnTruce(rows, truce("ai-1", 10 * HOUR));
    return { title: "Sand", subtitle: "Freja", tabs: ["actions"], overviewLines: [], actions: rows, buildings: [], crystal: [] };
  };

  it("is not the gold main action and says it breaks the truce", () => {
    const view = gatedView();
    expect(view.actions[0]).toMatchObject({ cost: BREAKS_TRUCE_NOTE, breaksTruce: true, disabled: false });
    expect(selectBarButtons(view)).toEqual([{ kind: "action", action: view.actions[0], primary: false }]);
    expect(actionBarHtml(view)).toContain('<span class="hud-v2-act-label">Launch Attack</span><span class="hud-v2-act-cost">Breaks truce</span>');
  });
});
