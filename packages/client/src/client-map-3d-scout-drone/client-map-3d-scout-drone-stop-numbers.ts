import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";

// Numbers over the planned scout stops in true-3D (client-map-3d-scout-drone-plan-overlay.ts), so the
// order of a route reads at a glance: first-time players could not tell which stop came first once a
// route crossed itself (player review 2026-11-21). One small camera-facing sprite per stop; each
// number's texture is painted once, the first time it is needed, never per frame.

const SIZE = 64;
/**
 * Badge size as a fraction of the screen's height, the same at every zoom: sized in world units it
 * shrank to an unreadable dot at phone zoom (2026-11-21). About 26px on an 812px-tall phone.
 */
const SCREEN_SIZE = 0.032;
const LIFT = 0.35;

export type ScoutStopNumbers = {
  /** Starts a frame: every badge hidden until placed again. */
  readonly begin: () => void;
  /** Shows `n` (1-based) at the scene point. */
  readonly place: (n: number, sceneX: number, sceneY: number, sceneZ: number) => void;
  readonly dispose: () => void;
};

const paintNumber = (n: number): CanvasTexture | null => {
  if (typeof document === "undefined") return null; // node tests: no canvas, the sprites stay untextured
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "rgba(8, 24, 33, 0.92)";
  ctx.strokeStyle = "#7fe6ff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e8fbff";
  ctx.font = `700 ${n > 9 ? 28 : 36}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), SIZE / 2, SIZE / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
};

export const createScoutStopNumbers = (scene: Scene, max: number): ScoutStopNumbers => {
  const group = new Group();
  group.name = "scout-drone-stop-numbers";
  scene.add(group);
  const sprites: Sprite[] = [];
  const textures: Array<CanvasTexture | null> = [];

  const spriteFor = (n: number): Sprite => {
    let sprite = sprites[n - 1];
    if (!sprite) {
      const texture = paintNumber(n);
      textures[n - 1] = texture;
      // No depth test, so terrain never hides a number; drawn over the route's beads and rings.
      sprite = new Sprite(new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
      sprite.scale.set(SCREEN_SIZE, SCREEN_SIZE, 1);
      sprite.renderOrder = 27;
      sprite.frustumCulled = false;
      sprites[n - 1] = sprite;
      group.add(sprite);
    }
    return sprite;
  };

  return {
    begin: () => {
      for (const sprite of sprites) if (sprite) sprite.visible = false;
    },
    place: (n, sceneX, sceneY, sceneZ) => {
      if (n < 1 || n > max) return;
      const sprite = spriteFor(n);
      sprite.position.set(sceneX, sceneY + LIFT, sceneZ);
      sprite.visible = true;
    },
    dispose: () => {
      scene.remove(group);
      for (const sprite of sprites) sprite?.material.dispose();
      for (const texture of textures) texture?.dispose();
    }
  };
};
