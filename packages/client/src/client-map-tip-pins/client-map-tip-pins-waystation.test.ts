// @vitest-environment happy-dom
// First-15 playtest (2026-11-28): "Activate on the waystation pop-up is half-hidden under a '!' pin", and a tap
// on it opened the Waystation Discovered tip instead. The tip's pin and the Activate card both stand above the
// waystation tile, and the pin layer (z-index 3) draws over the card layer (z-index 2). A tile with an Activate
// card now has no pin over it, in both renderers.
import { readFileSync } from "node:fs";
import { URL as NodeUrl } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTrue3DRendererActive } from "../client-renderer-mode.js";
import type { Tile } from "../client-types.js";
import { createWaystationReadyToasts } from "../client-waystation-site/client-waystation-ready-toasts.js";
import { createMapTipPins, type MapTipPin } from "./client-map-tip-pins.js";

const mountCanvas = (): HTMLCanvasElement => {
  const host = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  canvas.getBoundingClientRect = () => ({ width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  host.append(canvas);
  document.body.append(host);
  return canvas;
};

const rig = (): Tile => ({ x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", waystation: { activated: false } });
const state = { me: "me", authSessionReady: true, profileSetupRequired: false };
const size = 40;
const projection = { size, project: (x: number, y: number) => ({ sx: (x + 0.5) * size, sy: (y + 0.5) * size }) };
const visible = (tile: Tile) => [{ wx: tile.x, wy: tile.y, wk: `${tile.x},${tile.y}`, px: tile.x * size, py: tile.y * size, vis: "visible", t: tile }];
const waystationTip: MapTipPin = { key: "tip:WAYSTATION", x: 10, y: 10, kind: "tip", label: "Tip: Waystation Discovered!", open: vi.fn() };
const elsewhereTip: MapTipPin = { key: "tip:DOCK", x: 3, y: 3, kind: "tip", label: "Tip: Dock Discovered!", open: vi.fn() };

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => setTrue3DRendererActive(false));

describe("map tip pins and the waystation Activate card", () => {
  it("draws the pin layer over the card layer, so a pin on the card's tile would cover Activate", () => {
    const pinsCss = readFileSync(new NodeUrl("./client-map-tip-pins.css", import.meta.url), "utf8");
    const cardsCss = readFileSync(new NodeUrl("../client-waystation-site/client-waystation-ready-toasts.css", import.meta.url), "utf8");
    const z = (css: string, selector: string): number => Number(new RegExp(`${selector.replace(".", "\\.")} \\{[^}]*z-index: (\\d+)`).exec(css)?.[1]);
    expect(z(pinsCss, ".map-tip-pin-layer")).toBeGreaterThan(z(cardsCss, ".waystation-toast-layer"));
  });

  it.each([false, true])("keeps pins off a tile that shows an Activate card (true-3D=%s)", (three) => {
    setTrue3DRendererActive(three);
    const canvas = mountCanvas();
    const toasts = createWaystationReadyToasts(canvas, state);
    const pins = createMapTipPins(canvas, () => [waystationTip, elsewhereTip]);
    toasts.render(visible(rig()), projection);
    expect(toasts.cardTiles()).toEqual(new Set(["10,10"]));
    pins.render(projection, true, toasts.cardTiles());
    const keys = Array.from(document.querySelectorAll<HTMLButtonElement>(".map-tip-pin")).map((button) => button.dataset.pin);
    expect(keys).toEqual(["tip:DOCK"]);
    expect(document.querySelectorAll(".waystation-toast button")).toHaveLength(1);
  });

  it("gives the pin back once the card goes (the waystation was activated)", () => {
    const canvas = mountCanvas();
    const toasts = createWaystationReadyToasts(canvas, state);
    const pins = createMapTipPins(canvas, () => [waystationTip]);
    toasts.render(visible(rig()), projection);
    pins.render(projection, true, toasts.cardTiles());
    expect(document.querySelector(".map-tip-pin")).toBeNull();
    toasts.render(visible({ ...rig(), waystation: { activated: true } }), projection);
    expect(toasts.cardTiles().size).toBe(0);
    pins.render(projection, true, toasts.cardTiles());
    expect(document.querySelector<HTMLButtonElement>(".map-tip-pin")?.dataset.pin).toBe("tip:WAYSTATION");
  });

  it("is wired into the frame's overlays: the pins render after the cards, with the cards' tiles", () => {
    const source = readFileSync(new NodeUrl("../client-map-screen-overlays/client-map-screen-overlays.ts", import.meta.url), "utf8");
    const cardsAt = source.indexOf("waystationToasts.render(");
    const pinsAt = source.indexOf("tipPins.render(projection, tiles.length > 0, waystationToasts.cardTiles())");
    expect(cardsAt).toBeGreaterThan(0);
    expect(pinsAt).toBeGreaterThan(cardsAt);
  });
});
