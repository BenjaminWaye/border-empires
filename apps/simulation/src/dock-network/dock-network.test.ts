import { describe, expect, it } from "vitest";

import {
  buildDockLinksByDockTileKey,
  collectLinkedDockRevealKeysForOwners,
  computeLinkedDockRevealTileKeys
} from "./dock-network.js";

describe("computeLinkedDockRevealTileKeys", () => {
  it("returns a 3x3 patch around each linked dock for an owned dock", () => {
    const links = buildDockLinksByDockTileKey([
      { dockId: "a", tileKey: "10,10", pairedDockId: "b", connectedDockIds: ["b"] },
      { dockId: "b", tileKey: "30,30", pairedDockId: "a", connectedDockIds: ["a"] }
    ]);

    const reveal = computeLinkedDockRevealTileKeys(["10,10"], links, 100, 100);

    expect(reveal.size).toBe(9);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        expect(reveal.has(`${30 + dx},${30 + dy}`)).toBe(true);
      }
    }
  });

  it("wraps reveals around the world edges", () => {
    const links = buildDockLinksByDockTileKey([
      { dockId: "a", tileKey: "5,5", pairedDockId: "b", connectedDockIds: ["b"] },
      { dockId: "b", tileKey: "0,0", pairedDockId: "a", connectedDockIds: ["a"] }
    ]);

    const reveal = computeLinkedDockRevealTileKeys(["5,5"], links, 100, 100);

    expect(reveal.has("99,99")).toBe(true);
    expect(reveal.has("0,99")).toBe(true);
    expect(reveal.has("99,0")).toBe(true);
    expect(reveal.has("0,0")).toBe(true);
    expect(reveal.has("1,1")).toBe(true);
  });

  it("falls back to pairedDockId when connectedDockIds is empty", () => {
    const links = buildDockLinksByDockTileKey([
      { dockId: "a", tileKey: "10,10", pairedDockId: "b" },
      { dockId: "b", tileKey: "30,30", pairedDockId: "a" }
    ]);

    const reveal = computeLinkedDockRevealTileKeys(["10,10"], links, 100, 100);

    expect(reveal.has("30,30")).toBe(true);
  });

  it("returns empty set when the owned dock tile has no entry", () => {
    const links = buildDockLinksByDockTileKey([
      { dockId: "a", tileKey: "10,10", pairedDockId: "b", connectedDockIds: ["b"] },
      { dockId: "b", tileKey: "30,30", pairedDockId: "a", connectedDockIds: ["a"] }
    ]);

    const reveal = computeLinkedDockRevealTileKeys(["99,99"], links, 100, 100);

    expect(reveal.size).toBe(0);
  });

  it("merges reveals across multiple owned docks", () => {
    const links = buildDockLinksByDockTileKey([
      { dockId: "a", tileKey: "10,10", pairedDockId: "b", connectedDockIds: ["b"] },
      { dockId: "b", tileKey: "30,30", pairedDockId: "a", connectedDockIds: ["a"] },
      { dockId: "c", tileKey: "50,50", pairedDockId: "d", connectedDockIds: ["d"] },
      { dockId: "d", tileKey: "70,70", pairedDockId: "c", connectedDockIds: ["c"] }
    ]);

    const reveal = computeLinkedDockRevealTileKeys(["10,10", "50,50"], links, 100, 100);

    expect(reveal.has("30,30")).toBe(true);
    expect(reveal.has("70,70")).toBe(true);
    expect(reveal.size).toBe(18);
  });
});

describe("collectLinkedDockRevealKeysForOwners", () => {
  const docks = [
    { dockId: "a", tileKey: "10,10", pairedDockId: "b", connectedDockIds: ["b"] },
    { dockId: "b", tileKey: "30,30", pairedDockId: "a", connectedDockIds: ["a"] },
    { dockId: "c", tileKey: "50,50", pairedDockId: "d", connectedDockIds: ["d"] },
    { dockId: "d", tileKey: "70,70", pairedDockId: "c", connectedDockIds: ["c"] }
  ];
  const links = buildDockLinksByDockTileKey(docks);

  it("reveals only the linked docks of docks owned by a visibility owner", () => {
    const owners = new Map<string, string>([["10,10", "player-1"], ["50,50", "player-2"]]);

    const reveal = collectLinkedDockRevealKeysForOwners(
      new Set<string>(["player-1"]),
      docks,
      (tileKey) => owners.get(tileKey),
      links,
      100,
      100
    );

    expect(reveal.has("30,30")).toBe(true);
    expect(reveal.has("70,70")).toBe(false);
  });

  it("includes ally-owned docks", () => {
    const owners = new Map<string, string>([["10,10", "player-1"], ["50,50", "ally-2"]]);

    const reveal = collectLinkedDockRevealKeysForOwners(
      new Set<string>(["player-1", "ally-2"]),
      docks,
      (tileKey) => owners.get(tileKey),
      links,
      100,
      100
    );

    expect(reveal.has("30,30")).toBe(true);
    expect(reveal.has("70,70")).toBe(true);
  });

  it("returns empty set when no owned docks match a visibility owner", () => {
    const owners = new Map<string, string>([["10,10", "stranger"], ["50,50", "stranger"]]);

    const reveal = collectLinkedDockRevealKeysForOwners(
      new Set<string>(["player-1"]),
      docks,
      (tileKey) => owners.get(tileKey),
      links,
      100,
      100
    );

    expect(reveal.size).toBe(0);
  });

  it("returns empty set when visibilityOwnerIds is empty", () => {
    const owners = new Map<string, string>([["10,10", "player-1"]]);

    const reveal = collectLinkedDockRevealKeysForOwners(
      new Set<string>(),
      docks,
      (tileKey) => owners.get(tileKey),
      links,
      100,
      100
    );

    expect(reveal.size).toBe(0);
  });
});
