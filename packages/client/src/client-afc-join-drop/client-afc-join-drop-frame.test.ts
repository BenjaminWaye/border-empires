import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { afcJoinDropTipId } from "./client-afc-join-drop.js";
import { tickAfcJoinDropForFrame } from "./client-afc-join-drop-frame.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Wiring check: arming must bump the tile revision AND record the changed key, otherwise the 3D renderer never rebuilds and the "hidden" AFC would still be drawn.
describe("tickAfcJoinDropForFrame", () => {
  it("bumps the tile revision for the AFC tile when it arms, and honours the persisted 'played' flag", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) } });
    vi.stubGlobal("document", { visibilityState: "visible" });
    const state = createInitialState();
    state.me = "p1";
    state.camX = 10;
    state.camY = 10;
    const activatedAt = Date.now() - 1000;
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "p1", afc: { ownerId: "p1", status: "active", activatedAt } } as Tile);
    const revisionBefore = state.tilesRevision;
    tickAfcJoinDropForFrame(state, 0, { canvasWidth: 1000, canvasHeight: 800, tilePx: 40 }, keyFor);
    expect(state.afcJoinDrop.phase).toBe("waiting");
    expect(state.afcJoinDrop.tipId).toBe(afcJoinDropTipId(activatedAt));
    expect(state.tilesRevision).toBe(revisionBefore + 1);
    expect(state.tilesRevisionChangedKeys.has("10,10")).toBe(true);
    vi.unstubAllGlobals();
  });
});
