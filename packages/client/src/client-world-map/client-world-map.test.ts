// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { closeWorldMap, installWorldMap, isWorldMapOpen, openWorldMap, WORLD_MAP_ID } from "./client-world-map.js";
import { WORLD_MAP_FOG_RGB } from "./client-world-map-pixels.js";
import type { Tile } from "../client-types.js";

const put: ImageData[] = [];
const fakeCtx = {
  createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  putImageData: (data: ImageData) => put.push(data),
  clearRect: () => {}, drawImage: () => {}, strokeRect: () => {}, save: () => {}, restore: () => {}, beginPath: () => {},
  rect: () => {}, clip: () => {}, arc: () => {}, fill: () => {}, imageSmoothingEnabled: true, lineWidth: 1, strokeStyle: "", fillStyle: ""
};

const makeDeps = () => {
  const tiles = new Map<string, Tile>([["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me" } as Tile]]);
  const discoveredTiles = new Set(["5,5", "40,30"]);
  const state = { camX: 1, camY: 1, camSubX: 0.5, camSubY: 0.5, zoom: 20, me: "me", tiles, tilesRevision: 1, discoveredTiles };
  const deps = {
    state,
    mapCanvas: Object.assign(document.createElement("canvas"), { width: 800, height: 600 }),
    ownerColor: () => "#ff0000",
    terrainAt: () => "LAND" as const,
    wrapX: (x: number) => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH,
    wrapY: (y: number) => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT,
    requestViewRefresh: vi.fn(),
    maybeRefreshForCamera: vi.fn()
  };
  return { state, deps };
};

const root = (): HTMLElement => document.getElementById(WORLD_MAP_ID)!;
const canvas = (): HTMLCanvasElement => root().querySelector("canvas")!;
const tapCanvas = (clientX: number, clientY: number): void => {
  canvas().getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320, x: 0, y: 0, toJSON: () => ({}) });
  canvas().dispatchEvent(new MouseEvent("click", { clientX, clientY, bubbles: true }));
};

describe("world map", () => {
  beforeEach(() => {
    put.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(fakeCtx as never);
  });
  afterEach(() => {
    closeWorldMap();
    vi.restoreAllMocks();
  });

  it("opens as a dialog and paints only explored ground", () => {
    const { deps } = makeDeps();
    installWorldMap(deps);
    expect(root().hidden).toBe(true);
    openWorldMap();
    expect(isWorldMapOpen()).toBe(true);
    expect(root().hidden).toBe(false);
    expect(root().getAttribute("role")).toBe("dialog");
    const data = put.at(-1)!.data;
    const at = (x: number, y: number): number[] => Array.from(data.slice((y * WORLD_WIDTH + x) * 4, (y * WORLD_WIDTH + x) * 4 + 3));
    expect(at(5, 5)).not.toEqual([...WORLD_MAP_FOG_RGB]);
    // Neighbouring, never-revealed ground stays fog.
    expect(at(6, 5)).toEqual([...WORLD_MAP_FOG_RGB]);
    expect(at(300, 200)).toEqual([...WORLD_MAP_FOG_RGB]);
    // Explored earlier but no longer held (e.g. after a reload): still drawn, dimmed.
    expect(at(40, 30)).not.toEqual([...WORLD_MAP_FOG_RGB]);
  });

  it("moves the camera to the tapped place and closes", () => {
    const { state, deps } = makeDeps();
    installWorldMap(deps);
    const onPicked = vi.fn();
    openWorldMap({ onPicked });
    tapCanvas(320.5, 100.5);
    expect(state.camX).toBe(320);
    expect(state.camY).toBe(100);
    expect(state.camSubX).toBe(0);
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(isWorldMapOpen()).toBe(false);
    expect(root().hidden).toBe(true);
  });

  it("closes without moving the camera on a tap off the world, on the close button and on Esc", () => {
    const { state, deps } = makeDeps();
    installWorldMap(deps);
    openWorldMap();
    canvas().getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 640, right: 640, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });
    canvas().dispatchEvent(new MouseEvent("click", { clientX: 10, clientY: 10, bubbles: true }));
    expect(isWorldMapOpen()).toBe(false);
    expect(state.camX).toBe(1);

    openWorldMap();
    root().querySelector<HTMLElement>("[data-world-map-close]")!.click();
    expect(isWorldMapOpen()).toBe(false);

    openWorldMap();
    const hudEscape = vi.fn();
    window.addEventListener("keydown", hudEscape, true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(isWorldMapOpen()).toBe(false);
    // Esc closed the world map only: the HUD's own Esc (Settings) did not also fire.
    expect(hudEscape).not.toHaveBeenCalled();
    window.removeEventListener("keydown", hudEscape, true);
  });
});
