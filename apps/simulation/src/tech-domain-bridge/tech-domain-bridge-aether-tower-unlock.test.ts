import { describe, expect, it } from "vitest";

import { buildTechUpdatePayload, chooseTechForPlayer } from "./tech-domain-bridge.js";
import type { DomainPlayer } from "@border-empires/game-domain";

// Techs that unlock a structure/ability gated on isStructurePowered (a
// nearby active Ambaric Transformer Station / Aether Tower) live in their
// own, unrelated branches -- e.g. Grand Bazaars (urban-mintworks, coinage
// branch) unlocks the Imperial Exchange, whose levy ability then silently
// needs "plastics" (Ambaric Engineering, industrial branch) just to be
// buildable. Researching the gateway tech should also grant "plastics" for
// free so the tower is buildable without a detour through an unrelated
// branch. See the PR that added this (#1823).
const buildPlayer = (techIds: string[]): DomainPlayer => ({
  id: "player-1",
  isAi: false,
  points: 10_000,
  manpower: 0,
  techIds: new Set(techIds),
  allies: new Set(),
  strategicResources: {}
});

describe("chooseTechForPlayer — Aether Tower auto-unlock", () => {
  it("grants plastics for free when researching Grand Bazaars (Imperial Exchange), without needing its own branch", () => {
    const player = buildPlayer(["toolmaking", "ledger-keeping", "coinage"]);
    const result = chooseTechForPlayer(player, "urban-mintworks", []);
    expect(result).toEqual({ ok: true });
    expect(player.techIds.has("urban-mintworks")).toBe(true);
    expect(player.techIds.has("plastics")).toBe(true);
  });

  it("grants plastics for free when researching Grand Levy Doctrine (Titanium Levy)", () => {
    const player = buildPlayer(["global-trade-networks"]);
    const result = chooseTechForPlayer(player, "grand-levy-doctrine", []);
    expect(result).toEqual({ ok: true });
    expect(player.techIds.has("plastics")).toBe(true);
  });

  it("does not grant plastics for an unrelated tech", () => {
    const player = buildPlayer(["ledger-keeping"]);
    const result = chooseTechForPlayer(player, "coinage", []);
    expect(result).toEqual({ ok: true });
    expect(player.techIds.has("plastics")).toBe(false);
  });

  it("does not clobber plastics or double-charge anything if the player already has it", () => {
    const player = buildPlayer(["global-trade-networks", "mining", "industrial-extraction", "plastics"]);
    const techCountBefore = player.techIds.size;
    const result = chooseTechForPlayer(player, "grand-levy-doctrine", []);
    expect(result).toEqual({ ok: true });
    expect(player.techIds.has("plastics")).toBe(true);
    // Only the gateway tech itself is newly added -- plastics stays a
    // no-op re-add (Set semantics), not researched or charged a second time.
    expect(player.techIds.size).toBe(techCountBefore + 1);
  });

  it("plastics no longer appears as a reachable tech choice once auto-granted", () => {
    const player = buildPlayer(["global-trade-networks"]);
    chooseTechForPlayer(player, "grand-levy-doctrine", []);
    const payload = buildTechUpdatePayload(player, []);
    // Once auto-granted, plastics is already owned -- it must not still be
    // offered as a pending tech choice on top of that.
    expect(payload.nextChoices).not.toContain("plastics");
    expect(payload.techIds).toContain("plastics");
  });
});
