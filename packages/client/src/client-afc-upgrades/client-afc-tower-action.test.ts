import { describe, expect, it, vi } from "vitest";
import { afcTowerSuppressionAction, dispatchTileAetherAction, towerOpenToHijack } from "./client-afc-tower-action.js";
import { ownedActiveObservatoryWithinRange } from "../client-tile-action-support/client-tile-action-support.js";
import type { Tile } from "../client-types.js";
const tile: Tile = { x: 1, y: 0, terrain: "LAND", fogged: false, ownerId: "e", observatory: { ownerId: "e", status: "active" } };
describe("Counterphase emitter in the ordinary tower tile menu", () => {
  it("appears only for installed upgrades on visible hostile towers and respects range/cooldown", () => {
    const options = { installed: true, hostile: true, inRange: true, cooldownMs: 0 };
    expect(afcTowerSuppressionAction(tile, options)[0]).toMatchObject({ id: "suppress_aether_tower", disabled: false });
    expect(afcTowerSuppressionAction(tile, { ...options, cooldownMs: 5000 })[0]?.disabled).toBe(true);
    expect(afcTowerSuppressionAction(tile, { ...options, installed: false })).toEqual([]);
    expect(afcTowerSuppressionAction({ ...tile, fogged: true }, options)).toEqual([]);
  });
  it("sends suppression without playing Purge destruction effects", () => {
    const send = vi.fn(() => true), state = { aetherLanceFxQueue: [] };
    dispatchTileAetherAction("suppress_aether_tower", tile, state, send);
    expect(send).toHaveBeenCalledWith({ type: "SUPPRESS_AETHER_TOWER", x: 1, y: 0 });
    expect(state.aetherLanceFxQueue).toEqual([]);
  });
  it("does not offer casting through an owned suppressed tower", () => {
    const tower = { ...tile, x: 0, ownerId: "p", observatory: { ownerId: "p", status: "active" as const, suppressedUntil: Date.now() + 60_000 } };
    expect(ownedActiveObservatoryWithinRange({ me: "p", tiles: new Map([["0,0", tower]]), techIds: [], domainIds: [], techCatalog: [], domainCatalog: [] }, tile)).toBe(false);
  });
  it("offers Resonance Hijack only on towers out of shots or suppressed, and respects the 24h recharge", () => {
    const now = 1_000_000;
    const options = { installed: false, hijackInstalled: true, hijackReadyInMs: 0, now, hostile: true, inRange: true, cooldownMs: 0 };
    expect(afcTowerSuppressionAction(tile, options)[0]).toMatchObject({ id: "hijack_aether_tower", disabled: true });
    const emptied = { ...tile, observatory: { ownerId: "e", status: "active" as const, cooldownUntil: now + 60_000 } };
    expect(afcTowerSuppressionAction(emptied, options)[0]).toMatchObject({ id: "hijack_aether_tower", disabled: false });
    expect(afcTowerSuppressionAction(emptied, { ...options, hijackReadyInMs: 3_600_000 })[0]?.disabled).toBe(true);
    expect(towerOpenToHijack({ ownerId: "e", status: "active", suppressedUntil: now + 1 }, now)).toBe(true);
    expect(towerOpenToHijack({ ownerId: "e", status: "active", suppressedUntil: now + 1, hijack: { byPlayerId: "p", casterX: 0, casterY: 0, startedAt: now, endsAt: now + 5 } }, now)).toBe(false);
    const send = vi.fn(() => true);
    dispatchTileAetherAction("hijack_aether_tower", emptied, { aetherLanceFxQueue: [] }, send);
    expect(send).toHaveBeenCalledWith({ type: "HIJACK_AETHER_TOWER", x: 1, y: 0 });
  });
});
