import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";
import { drawScoutDroneEtaPill } from "../client-scout-drone/client-scout-drone-eta-label.js";

// True-3D half of the scout drone's "Back in 2m 51s" pill (client-scout-drone-eta-label.ts has
// the why and the 2D half): one camera-facing sprite floating over the drone. Its canvas texture
// is repainted only when the text changes (about once a second), never per frame.

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 128;
const FONT_PX = 60;
/** World size of the sprite (the width of the map's floating text, client-map-3d-floating-text.ts); keeps the canvas's 4:1 aspect. */
const LABEL_WORLD_WIDTH = 3.2;
/** Above the drone's body, clear of its rotor discs. */
export const SCOUT_ETA_LABEL_LIFT = 1.25;

export type ScoutDroneEtaLabel = {
  /** Shows `text` centred at the scene point, or hides the label when `text` is undefined. */
  readonly place: (sceneX: number, sceneY: number, sceneZ: number, text: string | undefined) => void;
  readonly dispose: () => void;
};

export const createScoutDroneEtaLabel = (scene: Scene): ScoutDroneEtaLabel => {
  // Node test env: no document, so no canvas -- the sprite still exists, untextured.
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  if (canvas) {
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
  }
  const ctx = canvas?.getContext("2d") ?? null;
  const texture = canvas ? new CanvasTexture(canvas) : null;
  if (texture) texture.colorSpace = SRGBColorSpace;
  // No depth test: the countdown stays readable when terrain or a building sits between it and the camera.
  const material = new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sprite = new Sprite(material);
  sprite.name = "scout-drone-eta-label";
  sprite.scale.set(LABEL_WORLD_WIDTH, (LABEL_WORLD_WIDTH * CANVAS_HEIGHT) / CANVAS_WIDTH, 1);
  // Same band as the other floating badges (client-map-3d-muster-progress-badge.ts).
  sprite.renderOrder = 27;
  sprite.frustumCulled = false;
  sprite.visible = false;
  scene.add(sprite);
  let shown: string | undefined;

  return {
    place: (sceneX, sceneY, sceneZ, text) => {
      if (text === undefined) {
        sprite.visible = false;
        return;
      }
      if (text !== shown) {
        shown = text;
        if (ctx && texture) {
          ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          drawScoutDroneEtaPill(ctx, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, text, FONT_PX);
          texture.needsUpdate = true;
        }
      }
      sprite.position.set(sceneX, sceneY, sceneZ);
      sprite.visible = true;
    },
    dispose: () => {
      scene.remove(sprite);
      material.dispose();
      texture?.dispose();
    }
  };
};
