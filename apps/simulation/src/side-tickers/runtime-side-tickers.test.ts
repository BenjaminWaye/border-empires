import { describe, expect, it } from "vitest";
import type { DomainPlayer } from "@border-empires/game-domain";
import type { HouseCharge, HouseChargesPayload } from "@border-empires/shared";
import { HOUSE_CHARGES_TICK_MIN_INTERVAL_MS } from "../house-charges/house-charges-ticker.js";
import { buildChargeWorld, makeChargePlayer } from "../house-charges/house-charges.test-helpers.js";
import { createRuntimeSideTickers } from "./runtime-side-tickers.js";

// Owner report 2026-11-23: after garrisoning House Gerald's AFC the Writ of
// Correction card kept saying "not taken" until the next 15s House Charges pass.
const RIVAL_AFC = "36,27";
const correction: HouseCharge = { id: "CORRECTION:x", kind: "CORRECTION", targets: [{ key: "house:p2", name: "Gerald", x: 36, y: 27 }], searchCircle: { x: 36, y: 27, radius: 9 }, rarity: "COMMON", renown: 2 };

const setup = () => {
  const tiles = buildChargeWorld();
  tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p2", ownershipState: "SETTLED", afc: { ownerId: "p2", status: "active", landedAt: 1 } });
  const players = new Map<string, DomainPlayer>([
    ["p1", makeChargePlayer("p1", { houseCharges: { dealtAt: 0, offered: [correction], keptIds: [correction.id] } })],
    ["p2", makeChargePlayer("p2")]
  ]);
  const ownedAfcs = new Map<string, Set<string>>([["p1", new Set()], ["p2", new Set([RIVAL_AFC])]]);
  const sent: HouseChargesPayload[] = [];
  const tickers = createRuntimeSideTickers({
    tiles: () => tiles,
    players: () => players,
    afcTileKeys: (playerId) => ownedAfcs.get(playerId) ?? new Set(),
    isPlayerSubscribed: (playerId) => playerId === "p1",
    emitPlayerMessage: (_command, payload) => {
      if (payload.type === "HOUSE_CHARGES") sent.push(payload as HouseChargesPayload);
    }
  });
  const recapture = (): void => {
    tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p2", afc: { ownerId: "p2", status: "active", capturedAt: 60, foundedBy: "p2" } });
    ownedAfcs.set("p1", new Set());
    ownedAfcs.set("p2", new Set([RIVAL_AFC]));
  };
  const capture = (): void => {
    tiles.set(RIVAL_AFC, { ...tiles.get(RIVAL_AFC)!, ownerId: "p1", afc: { ownerId: "p1", status: "active", capturedAt: 50, foundedBy: "p2" } });
    ownedAfcs.set("p1", new Set([RIVAL_AFC]));
    ownedAfcs.set("p2", new Set());
  };
  return { tickers, sent, capture, recapture };
};

describe("runtime side tickers: Writ of Correction refresh", () => {
  it("pushes the Writ as held on the next 1s tick after the House garrisons the rival's AFC", () => {
    const { tickers, sent, capture } = setup();
    tickers.tick(0);
    expect(sent.at(-1)?.charges[0]).toMatchObject({ held: false });
    capture();
    // Well inside the 15s throttle (HOUSE_CHARGES_TICK_MIN_INTERVAL_MS): only the AFC watch can notice.
    tickers.tick(HOUSE_CHARGES_TICK_MIN_INTERVAL_MS / 15);
    expect(sent.at(-1)?.charges[0]).toMatchObject({ held: true, size: 1 });
  });

  it("pushes the loss within a second when the rival retakes its AFC", () => {
    const { tickers, sent, capture, recapture } = setup();
    tickers.tick(0);
    capture();
    tickers.tick(1_000);
    recapture();
    tickers.tick(2_000);
    expect(sent.at(-1)?.charges[0]).toMatchObject({ held: false, lostAt: 2_000 });
  });

  it("does not re-push while the House's AFCs are unchanged", () => {
    const { tickers, sent } = setup();
    tickers.tick(0);
    const pushes = sent.length;
    tickers.tick(1_000);
    tickers.tick(2_000);
    expect(sent.length).toBe(pushes);
  });
});
