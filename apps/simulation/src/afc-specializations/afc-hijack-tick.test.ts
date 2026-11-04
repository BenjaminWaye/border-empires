import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import type { ObservatoryHijack } from "@border-empires/shared";
import { createHumanRuntimePlayer } from "../runtime-player-factory.js";
import { HIJACK_RESOLVE_GRACE_MS, tickResonanceHijacks, type AfcHijackDeps } from "./afc-hijack.js";

const tower = (x: number, ownerId: string, hijack?: ObservatoryHijack, suppressedUntil?: number): DomainTileState => ({ x, y: 0, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  observatory: { ownerId, status: "active", ...(hijack ? { hijack } : {}), ...(suppressedUntil ? { suppressedUntil } : {}) } });
const hijack: ObservatoryHijack = { byPlayerId: "p", victimId: "e", casterX: 1, casterY: 0, startedAt: 0, endsAt: 600_000 };

const fixture = (target: DomainTileState, locked = false) => {
  const tiles = new Map<string, DomainTileState>([["1,0", tower(1, "p")], ["5,0", target]]);
  const players = new Map([["p", createHumanRuntimePlayer("p")], ["e", createHumanRuntimePlayer("e")], ["c", createHumanRuntimePlayer("c")]]);
  const outcomes: string[] = [];
  const deps: AfcHijackDeps = { tiles, players, activeObservatoriesByOwner: () => new Map([[target.ownerId!, new Set(["5,0"])], ["p", new Set(["1,0"])]]),
    isStructureDormant: () => false, isTileLocked: () => locked, replaceTileState: (key, tile) => { tiles.set(key, tile); }, tileDeltaFromState: tile => ({ x: tile.x, y: tile.y }),
    applyEncirclement: () => {}, emitEvent: () => {}, emitPlayerStateUpdate: () => {},
    emitPlayerMessage: (_command, payload) => { if (payload.type === "AFC_HIJACK_OUTCOME") outcomes.push(String(payload.status)); } };
  return { tiles, players, deps, outcomes };
};

describe("Resonance Hijack resolution", () => {
  it("transfers the tower from its original owner when the takeover ends", () => {
    const { tiles, deps, outcomes } = fixture(tower(5, "e", hijack));
    tickResonanceHijacks(deps, 600_000);
    expect(tiles.get("5,0")).toMatchObject({ ownerId: "p", observatory: { ownerId: "p" } });
    expect(outcomes).toEqual(["succeeded", "succeeded"]); // one each for attacker and victim
  });

  it("fails instead of taking a tower a third House captured during the takeover", () => {
    const { tiles, deps, outcomes } = fixture(tower(5, "c", hijack));
    tickResonanceHijacks(deps, 600_000);
    expect(tiles.get("5,0")?.ownerId).toBe("c");
    expect(tiles.get("5,0")?.observatory?.hijack).toBeUndefined();
    expect(outcomes).toContain("failed");
  });

  it("fails once the two Houses agree a truce", () => {
    const { tiles, players, deps } = fixture(tower(5, "e", hijack));
    players.get("p")!.truces = new Set(["e"]);
    tickResonanceHijacks(deps, 300_000);
    expect(tiles.get("5,0")?.ownerId).toBe("e");
    expect(tiles.get("5,0")?.observatory?.hijack).toBeUndefined();
  });

  it("waits for an attack resolving on the tile, but never lands a takeover long past its end", () => {
    const locked = fixture(tower(5, "e", hijack), true);
    tickResonanceHijacks(locked.deps, 600_000);
    expect(locked.tiles.get("5,0")?.ownerId).toBe("e");
    expect(locked.tiles.get("5,0")?.observatory?.hijack).toBeDefined();
    const stale = fixture(tower(5, "e", hijack));
    tickResonanceHijacks(stale.deps, 600_000 + HIJACK_RESOLVE_GRACE_MS + 1);
    expect(stale.tiles.get("5,0")?.ownerId).toBe("e");
    expect(stale.outcomes).toContain("failed");
  });

  it("restores a Counterphase suppression that was running before a failed hijack", () => {
    const { tiles, deps } = fixture(tower(5, "e", { ...hijack, priorSuppressedUntil: 400_000 }, 600_000));
    tiles.set("1,0", { ...tower(1, "p"), observatory: { ownerId: "p", status: "active", suppressedUntil: 500_000 } });
    tickResonanceHijacks(deps, 200_000);
    expect(tiles.get("5,0")?.observatory?.suppressedUntil).toBe(400_000);
  });
});
