import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial, type Scene } from "three";

import { drawMusterProgressBadge, musterBadgePercent, type MusterBadgeKind } from "./client-muster-flag-badge/client-muster-flag-badge.js";

// 3D half of the muster flag progress badge (client-muster-flag-badge.ts has
// the why and the 2D half): a camera-facing sprite above each of our own
// muster banners. Unlike the static badge overlays (client-map-3d-
// observatory-cooldown-badge-overlay/ and friends), each badge shows its own
// number, so each sprite owns a small canvas texture -- redrawn only when its
// whole percent or ring colour changes, not every frame. Our own flags are
// few (the muster-flag limit), so a small pool, grown on demand, covers them.

const MAX_BADGES = 24;
const CANVAS_SIZE = 128;
const BADGE_WORLD_SIZE = 0.42;
// Clears the banner's crossbar and finial (CROSSBAR_Y ~0.98 above the plinth
// base, client-map-3d-muster-banner/muster-banner-geometry.ts) with room for
// the pointer, which aims down at the banner.
const FLOAT_Y = 1.32;
const BOB_AMPLITUDE = 0.035;
const BOB_PERIOD_MS = 2600;

export type MusterProgressBadgeSlot = {
  sceneX: number;
  sceneZ: number;
  surfaceY: number;
  ratio: number;
  kind: MusterBadgeKind;
  /** Stable per-flag phase (0-1) so neighbouring badges don't bob in lockstep. */
  phase: number;
};

export type MusterProgressBadgeLayer = {
  /** Places one badge per slot (extra slots beyond the pool are dropped) and hides the rest. */
  readonly sync: (slots: readonly MusterProgressBadgeSlot[], nowMs: number) => void;
  readonly dispose: () => void;
};

type Badge = { sprite: Sprite; material: SpriteMaterial; texture: CanvasTexture | null; ctx: CanvasRenderingContext2D | null; shownPercent: number; shownKind: MusterBadgeKind | undefined };

const createBadge = (): Badge => {
  // Node test env: no document, so no canvas -- the sprite still exists, untextured.
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  if (canvas) {
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
  }
  const texture = canvas ? new CanvasTexture(canvas) : null;
  if (texture) texture.colorSpace = SRGBColorSpace;
  const material = new SpriteMaterial({ toneMapped: false, map: texture, transparent: true, depthWrite: false });
  const sprite = new Sprite(material);
  sprite.name = "muster-progress-badge";
  sprite.scale.set(BADGE_WORLD_SIZE, BADGE_WORLD_SIZE, 1);
  // Same band as the other floating badges: above roads (25), below the
  // transient selection/waypoint markers (28+).
  sprite.renderOrder = 27;
  sprite.frustumCulled = false;
  sprite.visible = false;
  return { sprite, material, texture, ctx: canvas?.getContext("2d") ?? null, shownPercent: -1, shownKind: undefined };
};

const paint = (badge: Badge, ratio: number, kind: MusterBadgeKind): void => {
  const percent = musterBadgePercent(ratio);
  if (percent === badge.shownPercent && kind === badge.shownKind) return;
  badge.shownPercent = percent;
  badge.shownKind = kind;
  if (!badge.ctx || !badge.texture) return;
  badge.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  // The disc plus its pointer is ~2.45 radii tall; centre it so both fit.
  const radius = CANVAS_SIZE * 0.36;
  drawMusterProgressBadge(badge.ctx, CANVAS_SIZE / 2, CANVAS_SIZE * 0.4, radius, ratio, kind);
  badge.texture.needsUpdate = true;
};

export const createMusterProgressBadgeLayer = (scene: Scene): MusterProgressBadgeLayer => {
  const badges: Badge[] = [];

  const sync = (slots: readonly MusterProgressBadgeSlot[], nowMs: number): void => {
    const count = Math.min(slots.length, MAX_BADGES);
    while (badges.length < count) {
      const badge = createBadge();
      badges.push(badge);
      scene.add(badge.sprite);
    }
    for (let i = 0; i < badges.length; i += 1) {
      const badge = badges[i]!;
      const slot = i < count ? slots[i] : undefined;
      if (!slot) {
        badge.sprite.visible = false;
        continue;
      }
      paint(badge, slot.ratio, slot.kind);
      const bob = Math.sin(((nowMs / BOB_PERIOD_MS) + slot.phase) * Math.PI * 2) * BOB_AMPLITUDE;
      badge.sprite.position.set(slot.sceneX, slot.surfaceY + FLOAT_Y + bob, slot.sceneZ);
      badge.sprite.visible = true;
    }
  };

  const dispose = (): void => {
    for (const badge of badges) {
      scene.remove(badge.sprite);
      badge.material.dispose();
      badge.texture?.dispose();
    }
    badges.length = 0;
  };

  return { sync, dispose };
};
