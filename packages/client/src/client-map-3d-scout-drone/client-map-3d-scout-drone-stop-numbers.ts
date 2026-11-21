import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";

// Numbers over the planned scout stops in true-3D, and the drone's own badge in flight, (client-map-3d-scout-drone-plan-overlay.ts), so the
// order of a route reads at a glance: first-time players could not tell which stop came first once a
// route crossed itself (player review 2026-11-21). One small camera-facing sprite per stop; each
// number's texture is painted once, the first time it is needed, never per frame.

const SIZE = 64;
/**
 * Badge size as a fraction of the screen's height, the same at every zoom: sized in world units it
 * shrank to an unreadable dot at phone zoom (2026-11-21). With the map's 45° camera that is about
 * 5% of the screen's height: some 40px on an 812px phone, 45px on a 900px desktop.
 */
const SCREEN_SIZE = 0.04;
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

/**
 * The drone's own badge over its marker in flight: the bright ring alone read as one more stop (player
 * review 2026-11-21). Same screen-size sprite as the numbers, painted with the HUD's drone icon.
 */
export const createScoutDroneBadge = (scene: Scene): { readonly place: (sceneX: number, sceneY: number, sceneZ: number) => void; readonly hide: () => void; readonly dispose: () => void } => {
  let texture: CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx && typeof Path2D !== "undefined") {
      ctx.fillStyle = "rgba(8, 24, 33, 0.92)";
      ctx.strokeStyle = "#7fe6ff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // The icon's 24-unit viewBox, scaled into the badge (client-scout-drone-icons.ts SCOUT_DRONE_ICON).
      ctx.save();
      ctx.translate(SIZE * 0.2, SIZE * 0.2);
      ctx.scale((SIZE * 0.6) / 24, (SIZE * 0.6) / 24);
      ctx.strokeStyle = "#7fe6ff";
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.stroke(new Path2D("M2.5 7h6M15.5 7h6M5.5 7v3h13V7M9.5 16l-1.5 3M14.5 16l1.5 3"));
      ctx.fillStyle = "#7fe6ff";
      ctx.fill(new Path2D("M10.5 10h3a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 8 13.5v-1A2.5 2.5 0 0 1 10.5 10z"));
      ctx.restore();
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
    }
  }
  const sprite = new Sprite(new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  sprite.name = "scout-drone-badge";
  sprite.scale.set(SCREEN_SIZE * 1.15, SCREEN_SIZE * 1.15, 1);
  sprite.renderOrder = 27;
  sprite.frustumCulled = false;
  sprite.visible = false;
  scene.add(sprite);
  return {
    place: (sceneX, sceneY, sceneZ) => {
      sprite.position.set(sceneX, sceneY + LIFT * 2, sceneZ);
      sprite.visible = true;
    },
    hide: () => {
      sprite.visible = false;
    },
    dispose: () => {
      scene.remove(sprite);
      sprite.material.dispose();
      texture?.dispose();
    }
  };
};
