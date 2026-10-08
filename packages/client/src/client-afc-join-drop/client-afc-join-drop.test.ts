import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { afcJoinDropTipId, tickAfcJoinDrop, type AfcJoinDropTickDeps } from "./client-afc-join-drop.js";
import { isAfcHiddenForJoinDrop } from "./client-afc-join-drop-state.js";
import { AFC_JOIN_DESCENT_MS, AFC_JOIN_DROP_DWELL_MS, AFC_JOIN_FALLBACK_REVEAL_MS, AFC_JOIN_MAX_AGE_MS, AFC_JOIN_TOTAL_MS } from "./client-afc-join-drop-timeline.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const WALL = 10_000_000;
const ACTIVATED_AT = WALL - 60_000;

const afcTile = (ownerId: string, activatedAt: number): Tile =>
  ({ x: 10, y: 10, terrain: "LAND", ownerId, ownershipState: "SETTLED", afc: { ownerId, status: "active", activatedAt } }) as Tile;

const setup = (afc: Tile | null = afcTile("p1", ACTIVATED_AT)) => {
  const state = createInitialState();
  state.me = "p1";
  state.homeTile = { x: 10, y: 10 };
  state.camX = 10;
  state.camY = 10;
  state.connection = "initialized";
  state.firstChunkAt = 1;
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.guide.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  if (afc) state.tiles.set("10,10", afc);
  const seen = new Set<string>();
  const changed: Array<[number, number]> = [];
  const tick = (nowMs: number, over: Partial<AfcJoinDropTickDeps> = {}): void =>
    tickAfcJoinDrop({
      state,
      nowMs,
      wallNowMs: WALL,
      tabVisible: true,
      viewHalfExtentTiles: { halfW: 10, halfH: 8 },
      keyFor,
      isSeen: (id) => seen.has(id),
      markSeen: (id) => seen.add(id),
      onTileChanged: (x, y) => changed.push([x, y]),
      ...over
    });
  const hidden = (): boolean => isAfcHiddenForJoinDrop(state.afcJoinDrop, 10, 10);
  return { state, seen, changed, tick, hidden };
};

/** Arms the drop at t=0 and opens the gate at t=100, returning the time the drop starts. */
const startDrop = (t: ReturnType<typeof setup>): number => {
  t.tick(0);
  t.tick(100);
  const startAt = 100 + AFC_JOIN_DROP_DWELL_MS;
  t.tick(startAt);
  return startAt;
};

describe("tickAfcJoinDrop arming", () => {
  it("arms and hides the real AFC the moment the viewer's own fresh home AFC is seen", () => {
    const t = setup();
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    expect(t.hidden()).toBe(true);
    expect(t.changed).toEqual([[10, 10]]);
  });

  it("stays idle until the home AFC data arrives, then arms", () => {
    const t = setup(null);
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("idle");
    t.state.tiles.set("10,10", afcTile("p1", ACTIVATED_AT));
    t.state.tilesRevision += 1;
    t.tick(300);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
  });

  it("finds the AFC wherever it is: it is not necessarily on the home tile", () => {
    // Regression: the first version looked only at state.homeTile, but a live spawn put the AFC two tiles away, so the drop never armed.
    const t = setup(null);
    t.state.homeTile = { x: 10, y: 10 };
    t.state.tiles.set("10,12", { ...afcTile("p1", ACTIVATED_AT), y: 12 } as Tile);
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    expect(t.state.afcJoinDrop).toMatchObject({ x: 10, y: 12 });
    expect(isAfcHiddenForJoinDrop(t.state.afcJoinDrop, 10, 12)).toBe(true);
    expect(isAfcHiddenForJoinDrop(t.state.afcJoinDrop, 10, 10)).toBe(false);
  });

  it("does not rescan every frame: only when tiles changed and the scan interval has passed", () => {
    const t = setup(null);
    t.tick(0);
    t.state.tiles.set("10,10", afcTile("p1", ACTIVATED_AT));
    t.tick(50);
    expect(t.state.afcJoinDrop.phase).toBe("idle");
    t.state.tilesRevision += 1;
    t.tick(100);
    expect(t.state.afcJoinDrop.phase).toBe("idle");
    t.tick(300);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
  });

  it("never arms for an old AFC (a returning player's existing complex)", () => {
    const t = setup(afcTile("p1", WALL - AFC_JOIN_MAX_AGE_MS - 1));
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("idle");
    expect(t.hidden()).toBe(false);
    expect(t.changed).toEqual([]);
  });

  it("never arms for an AFC owned by someone else", () => {
    const t = setup(afcTile("p2", ACTIVATED_AT));
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("idle");
    expect(t.hidden()).toBe(false);
  });

  it("never arms once this AFC's drop has already been played", () => {
    const t = setup();
    t.seen.add(afcJoinDropTipId(ACTIVATED_AT));
    t.tick(0);
    expect(t.state.afcJoinDrop.phase).toBe("done");
    expect(t.hidden()).toBe(false);
  });
});

describe("tickAfcJoinDrop gate", () => {
  it.each([
    ["changelog open", (s: ReturnType<typeof setup>["state"]) => { s.changelog.open = true; }],
    ["tutorial open", (s: ReturnType<typeof setup>["state"]) => { s.guide.open = true; }],
    ["profile setup pending", (s: ReturnType<typeof setup>["state"]) => { s.profileSetupRequired = true; }],
    ["activity dashboard open", (s: ReturnType<typeof setup>["state"]) => { s.activityDashboard.open = true; }],
    ["first tiles not loaded", (s: ReturnType<typeof setup>["state"]) => { s.firstChunkAt = 0; }],
    ["not connected", (s: ReturnType<typeof setup>["state"]) => { s.connection = "connecting"; }]
  ])("does not start while %s, however long it lasts", (_label, block) => {
    const t = setup();
    block(t.state);
    for (let now = 0; now <= 60_000; now += 1_000) t.tick(now);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    expect(t.state.afcJoinDropFxQueue).toEqual([]);
    expect(t.hidden()).toBe(true);
  });

  it("does not start while the tab is hidden or the AFC is off screen", () => {
    const t = setup();
    for (let now = 0; now <= 5_000; now += 500) t.tick(now, { tabVisible: false });
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    t.state.camX = 200;
    for (let now = 5_000; now <= 10_000; now += 500) t.tick(now);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
  });

  it("starts only after the map has stayed unobstructed for the full dwell", () => {
    const t = setup();
    t.tick(0);
    t.tick(100);
    t.tick(100 + AFC_JOIN_DROP_DWELL_MS - 1);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    t.tick(100 + AFC_JOIN_DROP_DWELL_MS);
    expect(t.state.afcJoinDrop.phase).toBe("playing");
    expect(t.state.afcJoinDropFxQueue).toEqual([{ x: 10, y: 10, queuedAt: 100 + AFC_JOIN_DROP_DWELL_MS }]);
  });

  it("restarts the dwell when a dialog reappears part-way", () => {
    const t = setup();
    t.tick(0);
    t.tick(100);
    t.state.changelog.open = true;
    t.tick(800);
    t.state.changelog.open = false;
    t.tick(1_000);
    t.tick(100 + AFC_JOIN_DROP_DWELL_MS + 50);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    t.tick(1_000 + AFC_JOIN_DROP_DWELL_MS);
    expect(t.state.afcJoinDrop.phase).toBe("playing");
  });
});

describe("tickAfcJoinDrop playback", () => {
  it("fires onDropStart exactly once, the moment the landing starts (not during the dwell or afterward)", () => {
    const t = setup();
    let starts = 0;
    const onDropStart = (): void => {
      starts += 1;
    };
    t.tick(0, { onDropStart });
    t.tick(100, { onDropStart });
    t.tick(100 + AFC_JOIN_DROP_DWELL_MS - 1, { onDropStart });
    expect(starts).toBe(0);
    const startAt = 100 + AFC_JOIN_DROP_DWELL_MS;
    t.tick(startAt, { onDropStart });
    expect(starts).toBe(1);
    t.tick(startAt + AFC_JOIN_DESCENT_MS, { onDropStart });
    t.tick(startAt + AFC_JOIN_TOTAL_MS, { onDropStart });
    t.tick(startAt + AFC_JOIN_TOTAL_MS + 60_000, { onDropStart });
    expect(starts).toBe(1);
  });

  it("never fires onDropStart for a drop that was already played", () => {
    const t = setup();
    t.seen.add(afcJoinDropTipId(ACTIVATED_AT));
    let starts = 0;
    for (let now = 0; now <= 20_000; now += 500) t.tick(now, { onDropStart: () => (starts += 1) });
    expect(starts).toBe(0);
  });

  it("keeps the real AFC hidden until touchdown, then reveals it and rebuilds the 3D tiles", () => {
    const t = setup();
    const startAt = startDrop(t);
    const changesBefore = t.changed.length;
    t.tick(startAt + AFC_JOIN_DESCENT_MS - 1);
    expect(t.hidden()).toBe(true);
    t.tick(startAt + AFC_JOIN_DESCENT_MS);
    expect(t.hidden()).toBe(false);
    expect(t.state.afcJoinDrop.revealed).toBe(true);
    expect(t.changed.length).toBe(changesBefore + 1);
  });

  it("marks the drop played only once it completes, and never replays it", () => {
    const t = setup();
    const startAt = startDrop(t);
    t.tick(startAt + AFC_JOIN_TOTAL_MS - 1);
    expect(t.seen.size).toBe(0);
    t.tick(startAt + AFC_JOIN_TOTAL_MS);
    expect(t.state.afcJoinDrop.phase).toBe("done");
    expect(t.seen.has(afcJoinDropTipId(ACTIVATED_AT))).toBe(true);
    t.tick(startAt + AFC_JOIN_TOTAL_MS + 16);
    t.tick(startAt + AFC_JOIN_TOTAL_MS + 60_000);
    expect(t.state.afcJoinDrop.phase).toBe("done");
    expect(t.state.afcJoinDropFxQueue).toHaveLength(1);
  });

  it("stands down without marking played when the AFC is replaced mid-wait, then arms for the new one", () => {
    const t = setup();
    t.tick(0);
    t.state.tiles.set("10,10", afcTile("p1", ACTIVATED_AT + 5_000));
    t.tick(16);
    expect(t.seen.size).toBe(0);
    expect(t.state.afcJoinDrop.phase).toBe("done");
    expect(t.hidden()).toBe(false);
    t.state.tilesRevision += 1;
    t.tick(16 + 5_000);
    expect(t.state.afcJoinDrop.phase).toBe("waiting");
    expect(t.state.afcJoinDrop.tipId).toBe(afcJoinDropTipId(ACTIVATED_AT + 5_000));
  });

  it("reveals without animating if an overlay never closes, so the AFC cannot stay hidden forever", () => {
    const t = setup();
    t.state.changelog.open = true;
    t.tick(0);
    t.tick(AFC_JOIN_FALLBACK_REVEAL_MS - 1);
    expect(t.hidden()).toBe(true);
    t.tick(AFC_JOIN_FALLBACK_REVEAL_MS);
    expect(t.hidden()).toBe(false);
    expect(t.state.afcJoinDropFxQueue).toEqual([]);
    expect(t.seen.has(afcJoinDropTipId(ACTIVATED_AT))).toBe(true);
  });
});

describe("tickAfcJoinDrop queue bound", () => {
  it("keeps the 3D queue bounded when nothing drains it (2D-only session)", () => {
    const t = setup();
    for (let i = 0; i < 10; i += 1) {
      const startAt = 1_000_000 * (i + 1);
      t.state.afcJoinDrop.phase = "waiting";
      t.state.afcJoinDrop.decidedFor = "10,10:" + ACTIVATED_AT;
      t.state.afcJoinDrop.x = 10;
      t.state.afcJoinDrop.y = 10;
      t.tick(startAt);
      t.tick(startAt + 100);
      t.tick(startAt + 100 + AFC_JOIN_DROP_DWELL_MS);
    }
    expect(t.state.afcJoinDropFxQueue.length).toBeLessThanOrEqual(4);
  });
});
