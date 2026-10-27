import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { buildGatewaySocialState } from "../gateway-app/build-social-state-sink.js";
import { InMemoryGatewaySocialStore, SqliteGatewaySocialStore, type GatewaySocialStore } from "../social-store/social-store.js";
import { createDiplomacyOfferAcceptance } from "./diplomacy-offer-acceptance.js";
import type { DiplomacySettlementInput, DiplomacySettlementResult } from "./diplomacy-settlement.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

const players = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
const terms = { give: { gold: 7, shard: 0, resources: { NEURAL_RESIN: 1 } }, ask: { gold: 0, shard: 0 } };
const pending: DiplomacySettlementResult = { ok: false, pending: true, message: "Payment uncertain" };

for (const backend of ["memory", "sqlite"] as const) {
  describe(`${backend} treaty resource settlement recovery`, () => {
    for (const kind of ["truce", "alliance"] as const) {
      it(`${kind}: resumes the same payment after restart and expiry, without rechecking accepted consent`, async () => {
        const db = backend === "sqlite" ? new DatabaseSync(":memory:") : undefined;
        const store: GatewaySocialStore = db ? new SqliteGatewaySocialStore(db) : new InMemoryGatewaySocialStore();
        if (store instanceof SqliteGatewaySocialStore) store.applySchema();
        let clock = 1_000;
        const boot = () => buildGatewaySocialState(store, store.loadSnapshot(), players, () => clock);
        try {
          const before = boot();
          if (kind === "truce") before.requestTruce("a", "B", 12, { terms });
          else before.requestAlliance("a", "B", { terms });
          const offer = kind === "truce" ? before.snapshotForPlayer("b").incomingTruceRequests[0]! : before.snapshotForPlayer("b").incomingAllianceRequests[0]!;
          const payments = new Set<string>();
          const submitted: DiplomacySettlementInput[] = [];
          const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => {
            submitted.push(input);
            payments.add(input.commandId ?? `random-${submitted.length}`);
            return submitted.length === 1 ? pending : { ok: true, settlementId: input.commandId };
          });
          const accept = (socialState: ReturnType<typeof boot>, recheckProposer = vi.fn()) => createDiplomacyOfferAcceptance({ socialState, settlement: { settle }, recheckProposer, recordGatewayEvent: () => undefined });
          const first = accept(before);
          expect((await (kind === "truce" ? first.acceptTruce("b", offer.id) : first.acceptAlliance("b", offer.id))).ok).toBe(false);
          expect(store.loadSnapshot()[kind === "truce" ? "truceRequests" : "allianceRequests"][0]?.settlementPhase).toBe("paying");
          clock += 48 * 3_600_000;
          store.pruneExpired(clock);
          const after = boot();
          expect(after.isTreatySupplySettling(`diplomacy-settle:${kind}:${offer.id}`, "b")).toBe(true);
          expect((kind === "truce" ? after.cancelTruce("a", offer.id) : after.cancelAlliance("a", offer.id)).ok).toBe(false);
          expect((kind === "truce" ? after.rejectTruce("b", offer.id) : after.rejectAlliance("b", offer.id)).ok).toBe(false);
          const recheck = vi.fn(async () => ({ reason: "Stale AI opinion", withdraw: true }));
          const second = accept(after, recheck);
          expect((await (kind === "truce" ? second.acceptTruce("b", offer.id) : second.acceptAlliance("b", offer.id))).ok).toBe(true);
          expect(recheck).not.toHaveBeenCalled();
          expect(submitted[1]).toEqual(submitted[0]);
          expect(submitted[0]).toMatchObject({ commandId: `diplomacy-settle:${kind}:${offer.id}`, issuedAt: 1_000, refundIfLate: false });
          expect(payments.size).toBe(1);
          expect(after.isTreatySupplySettling(`diplomacy-settle:${kind}:${offer.id}`, "b")).toBe(false);
          expect(store.loadSnapshot()[kind === "truce" ? "truceRequests" : "allianceRequests"]).toHaveLength(0);
        } finally { db?.close(); }
      });
    }
  });
}

it("persists compensation before refund submission and resumes only that refund after restart", async () => {
  const store = new InMemoryGatewaySocialStore();
  const boot = () => buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
  const social = boot();
  social.requestTruce("a", "B", 12, { terms });
  const id = social.snapshotForPlayer("b").incomingTruceRequests[0]!.id;
  const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => input.refundOf ? pending : { ok: true, settlementId: input.commandId });
  const first = createDiplomacyOfferAcceptance({ socialState: { ...social, acceptTruce: () => ({ ok: false, code: "TRUCE_LOCKED_OUT", message: "locked" }) }, settlement: { settle }, recordGatewayEvent: () => undefined });
  expect((await first.acceptTruce("b", id)).ok).toBe(false);
  expect(store.loadSnapshot().truceRequests[0]?.settlementPhase).toBe("refunding");
  const resumedSettle = vi.fn(async (): Promise<DiplomacySettlementResult> => ({ ok: true }));
  const after = boot();
  const record = vi.spyOn(after, "acceptTruce");
  const onDiscarded = vi.fn();
  const resumed = createDiplomacyOfferAcceptance({ socialState: after, settlement: { settle: resumedSettle }, onDiscarded, recordGatewayEvent: () => undefined });
  expect((await resumed.acceptTruce("b", id)).ok).toBe(false);
  expect(resumedSettle).toHaveBeenCalledWith(expect.objectContaining({ commandId: `diplomacy-settle:truce:${id}:refund`, refundOf: `diplomacy-settle:truce:${id}`, refundIfLate: false }));
  expect(record).not.toHaveBeenCalled();
  expect(store.loadSnapshot().truceRequests).toHaveLength(0);
  expect(onDiscarded).toHaveBeenCalledOnce();
});

for (const kind of ["truce", "alliance"] as const) {
  it(`${kind}: atomically commits the paid treaty and removes its offer`, async () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqliteGatewaySocialStore(db);
    store.applySchema();
    const boot = () => buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
    try {
      const before = boot();
      if (kind === "truce") before.requestTruce("a", "B", 12, { terms });
      else before.requestAlliance("a", "B", { terms });
      const id = (kind === "truce" ? before.snapshotForPlayer("b").incomingTruceRequests : before.snapshotForPlayer("b").incomingAllianceRequests)[0]!.id;
      const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => ({ ok: true, settlementId: input.commandId }));
      db.exec(`CREATE TRIGGER fail_offer_delete BEFORE DELETE ON social_${kind}_requests BEGIN SELECT RAISE(ABORT, 'interrupted treaty commit'); END`);
      const accept = (socialState: ReturnType<typeof boot>) => createDiplomacyOfferAcceptance({ socialState, settlement: { settle }, recordGatewayEvent: () => undefined });
      const first = accept(before);
      await expect(kind === "truce" ? first.acceptTruce("b", id) : first.acceptAlliance("b", id)).rejects.toThrow("interrupted treaty commit");
      const interrupted = store.loadSnapshot();
      expect(interrupted[kind === "truce" ? "truceRequests" : "allianceRequests"][0]?.settlementPhase).toBe("paying");
      expect(interrupted[kind === "truce" ? "activeTruces" : "allianceRecords"]).toHaveLength(0);
      db.exec("DROP TRIGGER fail_offer_delete");
      const resumed = accept(boot());
      expect((await (kind === "truce" ? resumed.acceptTruce("b", id) : resumed.acceptAlliance("b", id))).ok).toBe(true);
      expect(settle.mock.calls[1]?.[0]).toEqual(settle.mock.calls[0]?.[0]);
      expect(store.loadSnapshot()[kind === "truce" ? "truceRequests" : "allianceRequests"]).toHaveLength(0);
    } finally { db.close(); }
  });
}

it("retains a paid offer for compensation when the real truce recorder refuses it", async () => {
  const store = new InMemoryGatewaySocialStore();
  const social = buildGatewaySocialState(store, store.loadSnapshot(), players, () => 1_000);
  social.requestTruce("a", "B", 12, { terms });
  const id = social.snapshotForPlayer("b").incomingTruceRequests[0]!.id;
  social.setSettlementPhase("truce", id, "paying");
  const after = buildGatewaySocialState(store, { ...store.loadSnapshot(), truceLockouts: [{ playerId: "a", lockoutUntil: 100_000 }] }, players, () => 1_000);
  const settle = vi.fn(async (input: DiplomacySettlementInput): Promise<DiplomacySettlementResult> => ({ ok: true, settlementId: input.commandId }));
  const accept = createDiplomacyOfferAcceptance({ socialState: after, settlement: { settle }, recordGatewayEvent: () => undefined });
  expect(await accept.acceptTruce("b", id)).toMatchObject({ ok: false, code: "TRUCE_LOCKED_OUT" });
  expect(settle).toHaveBeenLastCalledWith(expect.objectContaining({ refundOf: `diplomacy-settle:truce:${id}` }));
  expect(store.loadSnapshot().truceRequests).toHaveLength(0);
});
