import { describe, expect, it } from "vitest";

import { buildTechUpdatePayload, chooseTechForPlayer } from "./tech-domain-bridge.js";
import type { DomainPlayer } from "@border-empires/game-domain";

// Techs that unlock a structure/ability gated on isStructurePowered (a
// nearby active Ambaric Transformer Station / Aether Tower) live in their
// own, unrelated branches -- e.g. Grand Bazaars (urban-mintworks, coinage
// branch) unlocks the Imperial Exchange, whose levy ability then silently
// needs "plastics" just to be buildable. Researching the gateway tech
// should also grant "plastics" for free so the tower is buildable without
// a detour through an unrelated branch. "plastics" is not itself a
// standalone tech-tree entry -- it only ever exists as a side effect of
// researching one of the gateway techs below.
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
    const player = buildPlayer(["global-trade-networks", "aeronautics", "plastics"]);
    const techCountBefore = player.techIds.size;
    const result = chooseTechForPlayer(player, "grand-levy-doctrine", []);
    expect(result).toEqual({ ok: true });
    expect(player.techIds.has("plastics")).toBe(true);
    // Only the gateway tech itself is newly added -- plastics stays a
    // no-op re-add (Set semantics), not researched or charged a second time.
    expect(player.techIds.size).toBe(techCountBefore + 1);
  });

  it("plastics is granted silently -- it's not a standalone tech-tree entry, so it never appears in the tech catalog or as a pending choice", () => {
    const player = buildPlayer(["global-trade-networks"]);
    chooseTechForPlayer(player, "grand-levy-doctrine", []);
    const payload = buildTechUpdatePayload(player, []);
    expect(payload.nextChoices).not.toContain("plastics");
    expect(payload.techCatalog.some((tech) => tech.id === "plastics")).toBe(false);
    expect(payload.techIds).toContain("plastics");
  });
});
