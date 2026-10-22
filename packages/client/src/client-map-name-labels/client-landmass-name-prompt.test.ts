import { beforeEach, describe, expect, it, vi } from "vitest";

const seen = new Set<string>();
vi.mock("../client-discovery-tips/client-discovery-tips-storage.js", () => ({
  isDiscoveryTipSeen: (key: string) => seen.has(key),
  markDiscoveryTipSeen: (key: string) => { seen.add(key); }
}));
const opened: Array<{ name: string; submit: (name: string) => void }> = [];
vi.mock("./client-landmass-name-dialog.js", () => ({
  isLandmassNameDialogOpen: () => false,
  openLandmassNameDialog: (name: string, submit: (name: string) => void) => { opened.push({ name, submit }); }
}));
vi.mock("@border-empires/shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@border-empires/shared")>()),
  // A 4x3 island at (2..5, 2..4); everything else sea.
  terrainAt: (x: number, y: number) => (x >= 2 && x <= 5 && y >= 2 && y <= 4 ? "LAND" : "SEA"),
  getWorldSeed: () => 7
}));

const { createLandmassNamePrompt, landmassPromptKey } = await import("./client-landmass-name-prompt.js");

const islandTiles = (owned: boolean) => {
  const tiles = new Map<string, { x: number; y: number; terrain: "LAND"; ownerId?: string; ownershipState?: "SETTLED" }>();
  for (let y = 2; y <= 4; y += 1) for (let x = 2; x <= 5; x += 1) tiles.set(`${x},${y}`, owned ? { x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED" } : { x, y, terrain: "LAND" });
  return tiles;
};

const makeState = (owned: boolean) => ({
  me: "p1",
  tiles: islandTiles(owned),
  tilesRevision: 1,
  islandLabels: [{ id: "2,2", x: 3.5, y: 3, angle: 0, span: 4, thickness: 3, name: "Brassford Isle", status: "default" as const }],
  authEmail: "",
  connection: "initialized" as const
});

describe("createLandmassNamePrompt", () => {
  beforeEach(() => {
    seen.clear();
    opened.length = 0;
  });

  it("asks once, when the whole landmass is garrisoned, and sends the chosen name", () => {
    const state = makeState(true);
    const sent: unknown[] = [];
    const prompt = createLandmassNamePrompt({ state: state as never, sendGameMessage: (payload) => { sent.push(payload); return true; } });
    prompt.tick(10_000);
    expect(opened.map((entry) => entry.name)).toEqual(["Brassford Isle"]);
    expect(seen.has(landmassPromptKey(7, "2,2"))).toBe(true);
    opened[0]!.submit("Isle of Waypoint");
    expect(sent).toEqual([{ type: "NAME_ISLAND", x: 2, y: 2, name: "Isle of Waypoint" }]);

    state.tilesRevision += 1;
    prompt.tick(20_000);
    expect(opened).toHaveLength(1);
  });

  it("does not ask while any land tile is not garrisoned", () => {
    const state = makeState(false);
    createLandmassNamePrompt({ state: state as never, sendGameMessage: () => true }).tick(10_000);
    expect(opened).toHaveLength(0);
  });
});
