import type { Meta, StoryObj } from "@storybook/html-vite";
import {
  computeLocalReachSet,
  computeOutpostReachPreview,
  drawDormantFrontierTreatment,
  drawOutOfReachDimming,
  drawOutpostReachPreviewTile,
  drawReachBoundaryLine,
  isDormantFrontierTile
} from "@client/client-reach-overlay/client-reach-overlay.js";
import type { Tile } from "@client/client-types.js";

/**
 * Renders the *real* implementation from client-reach-overlay.ts — the
 * fixed-borders-via-reach client overlay (see
 * packages/shared/src/reach/reach.ts for the authoritative server-side
 * definition this mirrors). Builds a small synthetic world on a plain grid
 * (not the full hex/iso game canvas) so the boundary line, dormant-frontier
 * treatment, out-of-reach dimming, and beacon-placement preview can all be
 * inspected in isolation using the exact draw functions the game ships.
 */

const ME = "player-1";
const ENEMY = "player-2";
const GRID = 21; // odd so there's a clean center tile
const TILE = 28;

type Scenario = "reachAndDormant" | "beaconPreview";

// Loosely typed on purpose: this builds a minimal fixture, not a full Tile —
// only the fields the overlay functions under test actually read (ownerId,
// ownershipState, town, economicStructure, x/y). Typing this as Partial<Tile>
// would force every nested shape (Town, EconomicStructure, ...) to be
// fully populated even though nothing here consumes the rest of it.
const makeTile = (overrides: { x: number; y: number } & Record<string, unknown>): Tile =>
  ({
    terrain: "LAND",
    ownershipState: "FRONTIER",
    ...overrides
  }) as unknown as Tile;

/**
 * Builds the demo world: a town at the center (radius-3 reach), a
 * RELAY_BEACON pushed out to the east (radius-5 reach), a dormant-frontier
 * tile to the northwest (previously unsettled — still carries a leftover
 * economicStructure), an enemy pocket to the south (out-of-reach dimming),
 * and everything else left as plain unowned land.
 */
const buildWorld = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  const center = Math.floor(GRID / 2);
  const key = (x: number, y: number) => `${x},${y}`;

  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      tiles.set(key(x, y), makeTile({ x, y, ownershipState: "FRONTIER" }));
    }
  }

  // My town — radius-3 reach anchor.
  tiles.set(
    key(center, center),
    makeTile({
      x: center,
      y: center,
      ownerId: ME,
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    })
  );

  // My relay beacon, pushed east — radius-5 reach anchor.
  const beaconX = center + 6;
  tiles.set(
    key(beaconX, center),
    makeTile({
      x: beaconX,
      y: center,
      ownerId: ME,
      ownershipState: "SETTLED",
      economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "active" }
    })
  );

  // A handful of ordinary settled tiles between town and beacon so the
  // border reads as one contiguous shape rather than two separate rings.
  for (let x = center + 1; x < beaconX; x += 1) {
    tiles.set(key(x, center), makeTile({ x, y: center, ownerId: ME, ownershipState: "SETTLED" }));
  }

  // A short owned arm reaching south to the edge of the town's own reach
  // radius (away from the beacon's overlapping disk) — the boundary line
  // only ever draws on owned tiles (see client-runtime-loop.ts), so this
  // gives the demo an owned tile that actually sits on the reach edge to
  // show it.
  for (let x = center - 1; x <= center; x += 1) {
    tiles.set(key(x, center + 3), makeTile({ x, y: center + 3, ownerId: ME, ownershipState: "SETTLED" }));
  }

  // Dormant-frontier tile: mine, FRONTIER, but still holding a leftover
  // structure from before it was unsettled by a lost border contest.
  const dormantX = center - 5;
  const dormantY = center - 4;
  tiles.set(
    key(dormantX, dormantY),
    makeTile({
      x: dormantX,
      y: dormantY,
      ownerId: ME,
      ownershipState: "FRONTIER",
      economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "active" }
    })
  );

  // Enemy pocket to the south — visible, but outside my reach.
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      const x = center + dx;
      const y = center + 7 + dy;
      tiles.set(key(x, y), makeTile({ x, y, ownerId: ENEMY, ownershipState: "SETTLED" }));
    }
  }

  return tiles;
};

const renderReachAndDormant = (): HTMLElement => {
  const tiles = buildWorld();
  const reach = computeLocalReachSet(tiles, ME);

  const canvas = document.createElement("canvas");
  canvas.width = GRID * TILE;
  canvas.height = GRID * TILE;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d")!;

  const keyFor = (x: number, y: number) => `${x},${y}`;
  const wrap = (v: number) => ((v % GRID) + GRID) % GRID;

  // Base fill so ownership reads clearly under the overlays.
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const t = tiles.get(keyFor(x, y))!;
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle =
        t.ownerId === ME ? (t.ownershipState === "SETTLED" ? "#2a3f2a" : "#1c2a1c") : t.ownerId === ENEMY ? "#3a2020" : "#161b22";
      ctx.fillRect(px, py, TILE - 1, TILE - 1);
    }
  }

  // Overlay pass — exactly mirrors client-runtime-loop.ts's per-tile draw
  // order for the reach overlay.
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const t = tiles.get(keyFor(x, y))!;
      const px = x * TILE;
      const py = y * TILE;
      if (t.ownerId === ME && isDormantFrontierTile(t)) {
        drawDormantFrontierTreatment(ctx, px, py, TILE);
      }
      if (t.ownerId && t.ownerId !== ME && !reach.has(keyFor(x, y))) {
        drawOutOfReachDimming(ctx, px, py, TILE);
      }
      if (t.ownerId === ME) {
        drawReachBoundaryLine(ctx, x, y, px, py, TILE, reach, { tiles, keyFor, wrapX: wrap, wrapY: wrap });
      }
    }
  }

  // Structure glyphs so town/beacon/dormant read at a glance.
  ctx.font = "16px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of tiles.values()) {
    if (t.ownerId !== ME) continue;
    const px = t.x * TILE + TILE / 2;
    const py = t.y * TILE + TILE / 2;
    if (t.town) ctx.fillText("🏰", px, py);
    else if (t.economicStructure?.type === "RELAY_BEACON" && t.ownershipState === "SETTLED") ctx.fillText("📡", px, py);
    else if (isDormantFrontierTile(t)) ctx.fillText("💤", px, py);
  }

  const container = document.createElement("div");
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.padding = "1rem";
  container.style.background = "#1a1a24";
  container.style.color = "#ccc";
  container.style.maxWidth = "760px";

  const legend = document.createElement("div");
  legend.style.marginTop = "1rem";
  legend.style.fontSize = "0.875rem";
  legend.style.lineHeight = "1.7";
  legend.innerHTML = `
    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">Fixed-Border Reach Overlay</h3>
    <p style="margin: 0;">🏰 = town (radius 3) &nbsp; 📡 = active relay beacon (radius 5) &nbsp; 💤 = dormant frontier tile (previously unsettled, structure still present but inactive)</p>
    <p style="margin: 0.5rem 0 0;">Dashed gold line = reach boundary. Hatched dark tiles = visible but out of reach (EXPAND/SETTLE would fail). Amber-tinted tile = dormant frontier.</p>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);
  return container;
};

const renderBeaconPreview = (): HTMLElement => {
  const tiles = buildWorld();
  const reach = computeLocalReachSet(tiles, ME);
  const center = Math.floor(GRID / 2);
  const candidateX = center - 6;
  const candidateY = center + 1;
  const preview = computeOutpostReachPreview(candidateX, candidateY);

  const canvas = document.createElement("canvas");
  canvas.width = GRID * TILE;
  canvas.height = GRID * TILE;
  const ctx = canvas.getContext("2d")!;
  const keyFor = (x: number, y: number) => `${x},${y}`;
  const wrap = (v: number) => ((v % GRID) + GRID) % GRID;

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < GRID; y += 1) {
    for (let x = 0; x < GRID; x += 1) {
      const t = tiles.get(keyFor(x, y))!;
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = t.ownerId === ME ? (t.ownershipState === "SETTLED" ? "#2a3f2a" : "#1c2a1c") : "#161b22";
      ctx.fillRect(px, py, TILE - 1, TILE - 1);
      if (t.ownerId === ME) {
        drawReachBoundaryLine(ctx, x, y, px, py, TILE, reach, { tiles, keyFor, wrapX: wrap, wrapY: wrap });
      }
      drawOutpostReachPreviewTile(ctx, x, y, px, py, TILE, preview, { tiles, keyFor, wrapX: wrap, wrapY: wrap });
    }
  }

  ctx.font = "16px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🏰", center * TILE + TILE / 2, center * TILE + TILE / 2);
  ctx.fillText("👻📡", candidateX * TILE + TILE / 2, candidateY * TILE + TILE / 2);

  const container = document.createElement("div");
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.padding = "1rem";
  container.style.background = "#1a1a24";
  container.style.color = "#ccc";
  container.style.maxWidth = "760px";

  const legend = document.createElement("div");
  legend.style.marginTop = "1rem";
  legend.style.fontSize = "0.875rem";
  legend.style.lineHeight = "1.7";
  legend.innerHTML = `
    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">Beacon Placement — Reach Preview</h3>
    <p style="margin: 0;">👻📡 = candidate RELAY_BEACON placement (not yet built). Blue dashed outline = the reach disk it would add if built here — shown before the player confirms the build.</p>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);
  return container;
};

const render = (args: { scenario: Scenario }): HTMLElement =>
  args.scenario === "beaconPreview" ? renderBeaconPreview() : renderReachAndDormant();

const meta: Meta<{ scenario: Scenario }> = {
  title: "HUD/Reach Border Overlay",
  argTypes: {
    scenario: {
      control: { type: "radio" },
      options: ["reachAndDormant", "beaconPreview"]
    }
  },
  args: { scenario: "reachAndDormant" },
  render
};

export default meta;
type Story = StoryObj<{ scenario: Scenario }>;

export const ReachAndDormantFrontier: Story = { args: { scenario: "reachAndDormant" } };
export const BeaconPlacementPreview: Story = { args: { scenario: "beaconPreview" } };
