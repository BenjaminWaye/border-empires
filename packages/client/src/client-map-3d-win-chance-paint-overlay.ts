import { CanvasTexture, Scene, Sprite, SpriteMaterial } from "three";

// Workstream F0 (docs/replenishment-update-plan.md), redesigned per later
// design feedback: win-chance is a "XX%" text label with a dark shadow
// (not a tinted tile square) floating above every enemy tile the drag's
// straight arrow currently crosses (client-win-chance-paint-trigger.ts
// computes which tiles those are). Reuses the canvas-texture-on-a-billboard
// -Sprite technique client-map-3d-floating-text/client-map-3d-floating-text.ts
// already established, but static (no rise/fade animation, since these
// labels track a live drag rather than a one-shot event) and driven by the
// same clear/addTile/commit/dispose shape every other overlay in
// client-map-3d.ts uses -- a fixed pool of sprites created once, their
// label textures only rebuilt when the text they'd show actually changes.
const MAX_LABELS = 20; // matches client-win-chance-paint-trigger.ts's MAX_WIN_CHANCE_LABELS
const LABEL_RISE_ABOVE_HEIGHTFIELD = 1.1; // well above the arrow/paint plane so it reads clearly over terrain
const SPRITE_SCALE_X = 1.6;
const SPRITE_SCALE_Y = 0.5;
const LABEL_CANVAS_WIDTH = 256;
const LABEL_CANVAS_HEIGHT = 96;
const LABEL_FONT = "900 56px sans-serif";

export type WinChancePaintEntry = {
  sceneX: number;
  sceneZ: number;
  surfaceY: number;
  winChance: number;
  color: string;
};

export type WinChancePaintOverlay = {
  readonly clear: () => void;
  readonly addTile: (entry: WinChancePaintEntry) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const buildLabelTexture = (text: string, color: string): CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Dark shadow beneath the text for legibility over any terrain color.
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
};

type Slot = {
  sprite: Sprite;
  material: SpriteMaterial;
  texture: CanvasTexture | undefined;
  lastText: string | undefined;
};

export const createWinChancePaintOverlay = (scene: Scene): WinChancePaintOverlay => {
  const slots: Slot[] = [];
  for (let i = 0; i < MAX_LABELS; i++) {
    const material = new SpriteMaterial({ toneMapped: false, transparent: true, depthWrite: false, depthTest: false });
    const sprite = new Sprite(material);
    sprite.scale.set(SPRITE_SCALE_X, SPRITE_SCALE_Y, 1);
    sprite.visible = false;
    sprite.renderOrder = 24; // above the arrow overlay (23)
    scene.add(sprite);
    slots.push({ sprite, material, texture: undefined, lastText: undefined });
  }

  let entries: WinChancePaintEntry[] = [];

  const clear = (): void => { entries = []; };

  const addTile = (entry: WinChancePaintEntry): void => {
    if (entries.length >= MAX_LABELS) return;
    entries.push(entry);
  };

  const commit = (): void => {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      const entry = entries[i];
      if (!entry) { slot.sprite.visible = false; continue; }
      const text = `${Math.round(entry.winChance * 100)}%`;
      if (text !== slot.lastText) {
        slot.texture?.dispose();
        slot.texture = buildLabelTexture(text, entry.color);
        slot.material.map = slot.texture;
        slot.lastText = text;
      }
      slot.sprite.position.set(entry.sceneX, entry.surfaceY + LABEL_RISE_ABOVE_HEIGHTFIELD, entry.sceneZ);
      slot.sprite.visible = true;
    }
  };

  const dispose = (): void => {
    for (const slot of slots) {
      scene.remove(slot.sprite);
      slot.material.dispose();
      slot.texture?.dispose();
    }
  };

  return { clear, addTile, commit, dispose };
};
