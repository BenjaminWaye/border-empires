import type { Meta, StoryObj } from "@storybook/html-vite";
import { drawPersistentAlertLocators, persistentAlertsForState } from "@client/client-persistent-alerts/client-persistent-alerts.js";
import type { Tile } from "@client/client-types.js";

/**
 * Renders the *real* implementation from client-persistent-alerts.ts — every
 * off-screen locator kind, all well outside the camera view: a shard rain
 * site (💎), an active muster flag (crossed swords), and an unfed town (!).
 * Each is the same round pin body with a single tapered tip pointing at its
 * target (drawLocatorPinBody), just a different glyph inside.
 */

const CANVAS_W = 760;
const CANVAS_H = 420;

const musterTile = (x: number, y: number): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  muster: { ownerId: "me", amount: 120, mode: "HOLD", updatedAt: 0 }
});

const unfedTownTile = (x: number, y: number): Tile => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "me",
  ownershipState: "SETTLED",
  town: {
    type: "FARMING",
    name: "Storybook Town",
    baseGoldPerMinute: 1,
    supportCurrent: 0,
    supportMax: 4,
    goldPerMinute: 0,
    cap: 0,
    isFed: false,
    population: 25_000,
    maxPopulation: 100_000,
    populationGrowthPerMinute: 0,
    populationTier: "TOWN",
    connectedTownCount: 0,
    connectedTownBonus: 0,
    hasMintworks: false,
    mintworksActive: false,
    hasGranary: false,
    granaryActive: false
  }
});

const buildState = () => ({
  me: "me",
  camX: 100,
  camY: 100,
  waypoint: [] as import("@client/client-state/client-state.js").ClientWaypoint[],
  tiles: new Map<string, Tile>([
    ["380,90", musterTile(380, 90)],
    ["-140,110", unfedTownTile(-140, 110)]
  ]),
  persistentAlertLocators: [] as Array<{
    id: string;
    kind: "town_unfed" | "muster_active" | "waypoint_manpower_paused" | "shard_rain";
    x: number;
    y: number;
    screenX: number;
    screenY: number;
    radius: number;
  }>,
  // Far outside the visible window in three different directions, so all
  // three locators render at once without overlapping.
  shardRainStatus: {
    key: "storybook-rain",
    phase: "started" as const,
    startsAt: Date.now() - 60_000,
    expiresAt: Date.now() + 25 * 60_000,
    siteCount: 1,
    sites: [{ x: 340, y: 260 }]
  }
});

const render = (): HTMLElement => {
  const state = buildState();

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let gx = 0; gx <= CANVAS_W; gx += 40) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, CANVAS_H);
    ctx.stroke();
  }
  for (let gy = 0; gy <= CANVAS_H; gy += 40) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(CANVAS_W, gy);
    ctx.stroke();
  }

  // One tile-unit == 40px, centered on the camera.
  const size = 40;
  const worldToScreen = (wx: number, wy: number): { sx: number; sy: number } => ({
    sx: CANVAS_W / 2 + (wx - state.camX) * size,
    sy: CANVAS_H / 2 + (wy - state.camY) * size
  });

  const alerts = persistentAlertsForState(state);
  drawPersistentAlertLocators(state, {
    ctx,
    canvas,
    worldToScreen: (wx, wy) => worldToScreen(wx, wy),
    toroidDelta: (from, to) => to - from,
    size,
    halfW: 0,
    halfH: 0,
    nowMs: Date.now(),
    precomputedAlerts: alerts
  });

  const container = document.createElement("div");
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.padding = "1rem";
  container.style.background = "#1a1a24";
  container.style.color = "#ccc";
  container.style.maxWidth = "800px";

  const legend = document.createElement("div");
  legend.style.marginTop = "1rem";
  legend.style.fontSize = "0.875rem";
  legend.style.lineHeight = "1.7";
  legend.innerHTML = `
    <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">Off-Screen Alert Pins</h3>
    <p style="margin: 0;">Three alerts, all off-screen: a shard rain site (💎) to the southeast, an active muster flag (crossed swords) to the east, and an unfed town (!) to the west. Every kind uses the same round pin body — an icon slot with a single tapered tip pointing at the target, like the off-screen ping markers in Apex Legends, Destiny 2, or Fortnite.</p>
  `;

  container.appendChild(canvas);
  container.appendChild(legend);
  return container;
};

const meta: Meta = {
  title: "HUD/Off-Screen Alert Pins",
  render
};

export default meta;
type Story = StoryObj;

export const AllThreeKinds: Story = {};
