import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";

// Numbers over the planned scout stops in true-3D, the drone's own badge in flight, a pin on a framed find, (client-map-3d-scout-drone-plan-overlay.ts), so the
// order of a route reads at a glance: first-time players could not tell which stop came first once a
// route crossed itself (player review 2026-11-21). One small camera-facing sprite per stop; each
// number's texture is painted once, the first time it is needed, never per frame.

/** Canvas size: 128 keeps the digit and the drone crisp at their on-screen size. */
const SIZE = 128;
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
  // A solid disc with a white digit: drawn over the route with see-through fill, the beads and ring art
  // ran through the numbers and "3" read as "8" (player review 2026-11-21).
  ctx.fillStyle = "#1d8fb5";
  ctx.strokeStyle = "#e8fbff";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${n > 9 ? 56 : 72}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(n), SIZE / 2, SIZE / 2 + 4);
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
      sprite.renderOrder = 30;
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
      // A bold white drone with a dark outline and no disc: a thin-line icon on a ring read as a blob, and
      // as a fourth stop (player review 2026-11-21).
      ctx.save();
      ctx.translate(SIZE * 0.08, SIZE * 0.08);
      ctx.scale((SIZE * 0.84) / 24, (SIZE * 0.84) / 24);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const arms = new Path2D("M2.5 7h6M15.5 7h6M5.5 7v3h13V7M9.5 16l-1.5 3M14.5 16l1.5 3");
      const body = new Path2D("M10.5 10h3a2.5 2.5 0 0 1 2.5 2.5v1a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 8 13.5v-1A2.5 2.5 0 0 1 10.5 10z");
      ctx.strokeStyle = "#0b1720";
      ctx.lineWidth = 4.6;
      ctx.stroke(arms);
      ctx.stroke(body);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2.4;
      ctx.stroke(arms);
      ctx.fillStyle = "#ffffff";
      ctx.fill(body);
      ctx.fillStyle = "#1d8fb5";
      ctx.beginPath();
      ctx.arc(12, 13, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
    }
  }
  const sprite = new Sprite(new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  sprite.name = "scout-drone-badge";
  // Bigger than a stop badge, so the moving thing never reads as one of them.
  sprite.scale.set(SCREEN_SIZE * 1.7, SCREEN_SIZE * 1.7, 1);
  sprite.renderOrder = 31;
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

/**
 * A gold map pin standing over a find framed from the landing card: the ring on the ground alone could hide
 * under a town's name label (player review round 9). Same screen-size sprite as the badges.
 */
export const createScoutFindPin = (scene: Scene): { readonly place: (sceneX: number, sceneY: number, sceneZ: number) => void; readonly hide: () => void; readonly dispose: () => void } => {
  let texture: CanvasTexture | null = null;
  if (typeof document !== "undefined") {
    // Twice as tall as wide: a round head on a long stem down to the find. A short teardrop lost its point
    // under a town label and its head read as a gold coin (player review round 10).
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE * 2;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const cx = SIZE / 2;
      const headY = SIZE * 0.42;
      ctx.lineCap = "round";
      // Stem: dark outline, then gold.
      ctx.strokeStyle = "#2a1a06";
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(cx, headY);
      ctx.lineTo(cx, SIZE * 1.96);
      ctx.stroke();
      ctx.strokeStyle = "#f2c14e";
      ctx.lineWidth = 8;
      ctx.stroke();
      // Head: gold ring around a dark centre with a light dot, so it reads as a pin head, not a coin.
      ctx.beginPath();
      ctx.arc(cx, headY, SIZE * 0.34, 0, Math.PI * 2);
      ctx.fillStyle = "#f2c14e";
      ctx.strokeStyle = "#2a1a06";
      ctx.lineWidth = 7;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, headY, SIZE * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = "#3a2408";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - SIZE * 0.05, headY - SIZE * 0.05, SIZE * 0.05, 0, Math.PI * 2);
      ctx.fillStyle = "#fff4d2";
      ctx.fill();
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
    }
  }
  const sprite = new Sprite(new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  sprite.name = "scout-drone-find-pin";
  sprite.scale.set(SCREEN_SIZE * 1.3, SCREEN_SIZE * 2.6, 1);
  // The stem's foot sits on the find: anchor the sprite at its bottom centre.
  sprite.center.set(0.5, 0.02);
  sprite.renderOrder = 33;
  sprite.frustumCulled = false;
  sprite.visible = false;
  scene.add(sprite);
  return {
    place: (sceneX, sceneY, sceneZ) => {
      sprite.position.set(sceneX, sceneY, sceneZ);
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
