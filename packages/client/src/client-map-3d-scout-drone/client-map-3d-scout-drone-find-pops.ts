import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";
import { SCOUT_FIND_POP_MS, type ScoutFindPop } from "../client-scout-drone/client-scout-drone-finds.js";
import type { ScoutDroneScenePoint } from "./client-map-3d-scout-drone-overlay.js";

// True-3D pops for what the flying scout drone spots (client-scout-drone-finds.ts): "+1 Town" in gold
// rising from the find and fading, so the flight pays out as it goes (player reviews 2026-11-21). Sprites
// keep one size on screen at any zoom, like the stop badges: world-sized text was unreadable on a phone.
// Each pop's texture is painted once, when it first appears.

const WIDTH = 384;
const HEIGHT = 96;
/** Height on screen as a fraction of its height: about 34px on an 812px phone. */
const SCREEN_HEIGHT = 0.042;
const RISE = 1.6;

type Live = { sprite: Sprite; material: SpriteMaterial; texture: CanvasTexture | null };

const paint = (text: string): CanvasTexture | null => {
  if (typeof document === "undefined") return null; // node tests: no canvas
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = "800 60px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 12;
  ctx.strokeStyle = "rgba(24, 14, 4, 0.95)";
  ctx.strokeText(text, WIDTH / 2, HEIGHT / 2);
  ctx.fillStyle = "#ffd76a";
  ctx.fillText(text, WIDTH / 2, HEIGHT / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export type ScoutFindPopLayer = {
  /** Shows the live pops (spawning new ones, retiring expired ones) at `nowMs` (local clock). */
  readonly sync: (pops: readonly ScoutFindPop[], nowMs: number) => void;
  readonly dispose: () => void;
};

export const createScoutFindPopLayer = (scene: Scene, sceneFor: (x: number, y: number, out: ScoutDroneScenePoint) => void): ScoutFindPopLayer => {
  const group = new Group();
  group.name = "scout-drone-find-pops";
  scene.add(group);
  const live = new Map<number, Live>();
  const at: ScoutDroneScenePoint = { sceneX: 0, sceneZ: 0, surfaceY: 0 };

  const retire = (id: number): void => {
    const entry = live.get(id);
    if (!entry) return;
    group.remove(entry.sprite);
    entry.material.dispose();
    entry.texture?.dispose();
    live.delete(id);
  };

  return {
    sync: (pops, nowMs) => {
      if (pops.length === 0 && live.size === 0) return; // nothing to draw: no work, no allocation
      const current = new Set<number>();
      for (const pop of pops) {
        const t = (nowMs - pop.at) / SCOUT_FIND_POP_MS;
        if (t < 0 || t >= 1) continue;
        current.add(pop.id);
        let entry = live.get(pop.id);
        if (!entry) {
          const texture = paint(pop.text);
          const material = new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false });
          const sprite = new Sprite(material);
          sprite.name = "scout-drone-find-pop";
          sprite.renderOrder = 32;
          sprite.frustumCulled = false;
          group.add(sprite);
          entry = { sprite, material, texture };
          live.set(pop.id, entry);
        }
        // Pops in over the first tenth, rises, fades out over the last third.
        const grow = Math.min(1, t / 0.1);
        const scale = SCREEN_HEIGHT * (0.6 + 0.4 * grow);
        entry.sprite.scale.set((scale * WIDTH) / HEIGHT, scale, 1);
        entry.material.opacity = t < 0.66 ? 1 : 1 - (t - 0.66) / 0.34;
        sceneFor(pop.x, pop.y, at);
        entry.sprite.position.set(at.sceneX, at.surfaceY + 0.8 + RISE * t, at.sceneZ);
      }
      for (const id of [...live.keys()]) if (!current.has(id)) retire(id);
      group.visible = live.size > 0;
    },
    dispose: () => {
      for (const id of [...live.keys()]) retire(id);
      scene.remove(group);
    }
  };
};
