import { ACESFilmicToneMapping, CanvasTexture, DirectionalLight, InstancedMesh, Mesh, MeshBasicMaterial, PlaneGeometry } from "three";
import type { Meta, StoryObj } from "@storybook/html-vite";
import { createBarleyFieldOverlay, barleyFieldVariantAt, BARLEY_DETAIL_MIN_ZOOM, type BarleyFieldVariant } from "@client/client-map-3d-barley-field.js";
import { createStructureOverlay, type StructureKind } from "@client/client-map-3d-structure-overlay/client-map-3d-structure-overlay.js";
import { createContactShadowOverlay } from "@client/client-map-3d-contact-shadow/client-map-3d-contact-shadow.js";
import { createHeightfield, type Heightfield } from "@client/client-map-3d-heightfield/client-map-3d-heightfield.js";
import { createStage, wrapWithCleanup, type Stage } from "../three-stage.js";

type Args = {
  cameraDistance: number;
  spacing: number;
  count: number;
};

// The overlay picks a 0/1/2 variant from the (worldTileX, worldTileY) hash internally (same
// approach as the titanium deposit) and uses it to salt the tile's rotation. To force a specific
// variant in a story, search for a worldTileX (with worldTileY = 0) that hashes to the target
// variant — the hash is the exported function, so this always matches the module.
const worldXForVariant = (variant: BarleyFieldVariant): number => {
  for (let wx = 0; wx < 200; wx += 1) {
    if (barleyFieldVariantAt(wx, 0) === variant) return wx;
  }
  return 0;
};

// The baked model loads asynchronously (GLTFLoader.load, a real HTTP fetch in Storybook's actual
// browser) — this is normal, matches how the game itself loads it, and the stage keeps rendering
// frames while it's in flight, so a story naturally upgrades from the synchronous far-LOD plane
// to the real model within tens of milliseconds without needing to be told to. Story render
// functions here stay synchronous for that reason (Storybook's html-vite renderer doesn't accept
// a Promise<HTMLElement> from `render`) — only the two stories that print instance/triangle
// counts in a caption need to know once the swap has actually happened, via this poll.
const waitForDetailMesh = async (stage: Stage, timeoutMs = 2000): Promise<void> => {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const meshCount = stage.scene.children.filter((c) => c instanceof InstancedMesh).length;
    if (meshCount >= 2) return; // far-LOD plane + detail mesh
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

// A soft radial-contact-shadow disc placed flat on the ground plane so an
// isolated field on a neutral backdrop still looks grounded instead of
// floating. Unlit, transparent, renders just above the tile surface.
const createContactShadow = (radius: number): { mesh: Mesh; dispose: () => void } => {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(8, 10, 14, 0.45)");
  gradient.addColorStop(0.55, "rgba(8, 10, 14, 0.25)");
  gradient.addColorStop(1, "rgba(8, 10, 14, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = "srgb";
  const geometry = new PlaneGeometry(1, 1);
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.scale.set(radius * 2, radius * 2, 1);
  const dispose = (): void => { geometry.dispose(); material.dispose(); texture.dispose(); };
  return { mesh, dispose };
};

// Gameplay-context lighting (perspective, on real terrain): warm golden key so the crop rows and
// dirt border catch light like a field at low sun, with a cool back rim for silhouette separation.
const fieldStage = (opts: { cameraDistance: number; cameraTilt?: number }): Stage => {
  const stage = createStage({ cameraDistance: opts.cameraDistance, cameraTilt: opts.cameraTilt ?? 0.5, background: "#1b1d22" });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.25;
  const sun = new DirectionalLight(0xffe0b0, 1.8);
  sun.position.set(-6, 9, -8);
  stage.scene.add(sun);
  const rim = new DirectionalLight(0xc2e1ff, 0.8);
  rim.position.set(0, 6, 12);
  stage.scene.add(rim);
  return stage;
};

// Asset-studio lighting for the orthographic hero shots: a warm near-camera key that catches the
// crop rows facing the viewer, a cool back rim for the far silhouette, and a soft fill so the
// shadow side never clips.
const studioStage = (opts: { cameraDistance: number; cameraTilt?: number; orthoHalfHeight?: number; background: string }): Stage => {
  const stage = createStage({
    camera: "orthographic",
    cameraDistance: opts.cameraDistance,
    cameraTilt: opts.cameraTilt ?? 0.6,
    background: opts.background,
    ...(opts.orthoHalfHeight !== undefined ? { orthoHalfHeight: opts.orthoHalfHeight } : {})
  });
  stage.renderer.toneMapping = ACESFilmicToneMapping;
  stage.renderer.toneMappingExposure = 1.3;
  const key = new DirectionalLight(0xfff1dd, 2.2);
  key.position.set(3, 9, 7);
  stage.scene.add(key);
  const rim = new DirectionalLight(0xc2e1ff, 1.4);
  rim.position.set(-7, 6, -9);
  stage.scene.add(rim);
  const fill = new DirectionalLight(0xdbe6f2, 0.7);
  fill.position.set(8, 3, 9);
  stage.scene.add(fill);
  return stage;
};

// Same role as OVERLAY_RISE_ABOVE_HEIGHTFIELD / TILE_CENTER_OFFSET in client-map-3d.ts (not
// exported from there, so duplicated here — see that file's own comment on why overlays sit on
// the max of a tile's 4 corners rather than its base elevation).
const OVERLAY_RISE_ABOVE_HEIGHTFIELD = 0.012;
const TILE_CENTER_OFFSET = 0.5;

// A small flat, all-grass real-terrain patch (heightfield mesh + skirt), the same terrain the
// game map itself is built from — not a procedural flat plane. Farmland is flat land, so unlike
// HillsOnTerrain.stories.ts this never marks any tile as hills. Patterns/placement are in
// *absolute* world tile coords centered on CENTER, not (0, 0) — the heightfield wraps negative
// offsets from camX/camY into the top of [0, worldWidth), so small negative coordinates would
// silently miss themselves inside the heightfield's own tile sampling (see the equivalent note in
// HillsOnTerrain.stories.ts).
const CENTER = 100;

type RealTerrain = {
  readonly stage: Stage;
  readonly heightfield: Heightfield;
  /** Scene-space (sceneX, surfaceY, sceneZ) for a tile's center, given ABSOLUTE world coords. */
  readonly placementAt: (wx: number, wy: number) => { sceneX: number; surfaceY: number; sceneZ: number };
  readonly dispose: () => void;
};

const realTerrainStage = (opts: { cameraDistance: number; cameraTilt?: number; halfW: number; halfH: number }): RealTerrain => {
  const stage = fieldStage({ cameraDistance: opts.cameraDistance, ...(opts.cameraTilt !== undefined ? { cameraTilt: opts.cameraTilt } : {}) });
  const hf = createHeightfield();
  stage.scene.add(hf.mesh, hf.skirtMesh, hf.gridlines);
  hf.setGridlinesVisible(false);
  hf.rebuild({
    camX: CENTER,
    camY: CENTER,
    halfW: opts.halfW,
    halfH: opts.halfH,
    worldWidth: 240,
    worldHeight: 240,
    tileKindAt: () => "GRASS"
  });

  const placementAt = (wx: number, wy: number): { sceneX: number; surfaceY: number; sceneZ: number } => {
    const surfaceY =
      Math.max(
        hf.elevationAt(wx, wy),
        hf.cornerYAt(wx, wy),
        hf.cornerYAt(wx + 1, wy),
        hf.cornerYAt(wx, wy + 1),
        hf.cornerYAt(wx + 1, wy + 1)
      ) + OVERLAY_RISE_ABOVE_HEIGHTFIELD;
    return { sceneX: wx - CENTER + TILE_CENTER_OFFSET, surfaceY, sceneZ: wy - CENTER + TILE_CENTER_OFFSET };
  };

  const dispose = (): void => {
    stage.scene.remove(hf.mesh, hf.skirtMesh, hf.gridlines);
    hf.dispose();
  };

  return { stage, heightfield: hf, placementAt, dispose };
};

const meta: Meta<Args> = {
  title: "3D Library/FertileField",
  argTypes: {
    cameraDistance: { control: { type: "range", min: 2, max: 16, step: 0.5 } },
    spacing: { control: { type: "range", min: 0.8, max: 2.5, step: 0.1 } },
    count: { control: { type: "range", min: 1, max: 7, step: 1 } }
  },
  args: { cameraDistance: 9, spacing: 1, count: 3 },
  render: (args) => {
    const terrain = realTerrainStage({ cameraDistance: args.cameraDistance, halfW: 6, halfH: 6 });
    const overlay = createBarleyFieldOverlay(terrain.stage.scene, Math.max(args.count, 1));
    const offset = (args.count - 1) / 2;
    for (let i = 0; i < args.count; i += 1) {
      const wx = CENTER + Math.round((i - offset) * args.spacing);
      const p = terrain.placementAt(wx, CENTER);
      overlay.addInstance(p.sceneX, p.sceneZ, p.surfaceY, wx, CENTER);
    }
    overlay.commit();
    return wrapWithCleanup(terrain.stage, [overlay.dispose, terrain.dispose]);
  }
};

export default meta;
type Story = StoryObj<Args>;

// The hero asset shot: a single Fertile Field tile — the baked "Emerald Crop Rows" model (leafy
// crop rows inside a dirt border) — isolated on a neutral studio backdrop, rendered with an
// orthographic three-quarter camera (no perspective foreshortening) and a soft contact shadow —
// the way the asset will be presented in marketing/UI. Deliberately NOT on real terrain: this is
// product photography of the asset itself, the same role studioStage plays for every other
// asset-hero story in this library (see e.g. UmbriteDeposit.stories.ts).
export const Field: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 5, cameraTilt: 0.6, orthoHalfHeight: 1.15, background: "#9aa0a8" });
    const shadow = createContactShadow(0.85);
    stage.scene.add(shadow.mesh);
    const overlay = createBarleyFieldOverlay(stage.scene, 1);
    overlay.addInstance(0, 0, 0, 0, 0);
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, shadow.dispose]);
  }
};

// Three tiles side by side, each seeded from a different (worldTileX, worldTileY) so their
// rotation differs — the only per-tile variety this overlay has left since the model itself
// (not a procedural texture) supplies the crop's look. Rotation is quantized to 90-degree steps
// (client-map-3d-barley-field.ts) since the model is a square tile with a dirt border baked to
// its own edges — an in-between angle would cut that border diagonally across the tile.
export const RotationVariety: Story = {
  render: () => {
    const stage = studioStage({ cameraDistance: 6, cameraTilt: 0.62, orthoHalfHeight: 1.7, background: "#9aa0a8" });
    const overlay = createBarleyFieldOverlay(stage.scene, 3);
    const shadows = ([0, 1, 2] as const).map(() => {
      const shadow = createContactShadow(0.7);
      stage.scene.add(shadow.mesh);
      return shadow;
    });
    ([0, 1, 2] as const).forEach((v, idx) => {
      const x = (idx - 1) * 1.5;
      overlay.addInstance(x, 0, 0, worldXForVariant(v), 0);
    });
    overlay.commit();
    return wrapWithCleanup(stage, [overlay.dispose, ...shadows.map((s) => s.dispose)]);
  }
};

// A small cluster of Fertile Field tiles on real terrain — how they read together from the normal
// game camera, sitting on the actual heightfield mesh instead of a flat placeholder plane.
export const FarmCluster: Story = {
  args: { cameraDistance: 10, spacing: 1, count: 7 }
};

// Counts what a scene actually asks the GPU to draw, so the far-LOD's cost saving can be read off
// the screen instead of taken on faith.
const drawStats = (stage: Stage): { instances: number; triangles: number; meshes: number } => {
  let instances = 0;
  let triangles = 0;
  let meshes = 0;
  stage.scene.traverse((object) => {
    const mesh = object as Mesh & { isInstancedMesh?: boolean; count?: number };
    if (!mesh.isInstancedMesh || !mesh.geometry) return;
    const count = mesh.count ?? 0;
    if (count === 0) return;
    meshes += 1;
    instances += count;
    const index = mesh.geometry.getIndex();
    const position = mesh.geometry.getAttribute("position");
    const perInstance = index ? index.count / 3 : (position ? position.count / 3 : 0);
    triangles += perInstance * count;
  });
  return { instances, triangles, meshes };
};

const captionedRow = (panels: ReadonlyArray<{ label: string; note: string; element: HTMLElement; noteEl?: HTMLDivElement }>): HTMLElement => {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.flexWrap = "wrap";
  row.style.gap = "16px";
  row.style.background = "#0a0e14";
  row.style.padding = "16px";
  row.style.fontFamily = "system-ui, sans-serif";
  for (const panel of panels) {
    const cell = document.createElement("div");
    cell.style.flex = "1 1 380px";
    cell.style.minWidth = "320px";
    const title = document.createElement("div");
    title.style.cssText = "color:#e8eef7;font-size:13px;font-weight:600;margin-bottom:2px;";
    title.textContent = panel.label;
    const note = panel.noteEl ?? document.createElement("div");
    note.style.cssText = "color:#8fa0b6;font-size:12px;margin-bottom:8px;line-height:1.4;";
    note.textContent = panel.note;
    cell.append(title, note, panel.element);
    row.appendChild(cell);
  }
  return row;
};

// Near detail (the baked model) vs the zoomed-out fallback, side by side, both on real terrain.
// The far LOD is a flat untextured plane — cheaper to draw and avoids texture minification
// shimmer once a tile is too small on screen for the model's own detail to resolve. The "near"
// caption starts out showing the far-LOD count too (the model hasn't finished its network fetch
// yet) and updates itself once it has, same as the tile actually upgrading on screen.
export const DetailVsFarLod: Story = {
  render: () => {
    const build = (detail: boolean): { stage: Stage; element: HTMLElement; noteEl: HTMLDivElement } => {
      const terrain = realTerrainStage({ cameraDistance: 7, halfW: 3, halfH: 3 });
      const overlay = createBarleyFieldOverlay(terrain.stage.scene, 9);
      overlay.setDetailEnabled(detail);
      for (let gz = -1; gz <= 1; gz += 1) {
        for (let gx = -1; gx <= 1; gx += 1) {
          const wx = CENTER + gx;
          const wy = CENTER + gz;
          const p = terrain.placementAt(wx, wy);
          overlay.addInstance(p.sceneX, p.sceneZ, p.surfaceY, wx, wy);
        }
      }
      overlay.commit();
      const noteEl = document.createElement("div");
      return { stage: terrain.stage, element: wrapWithCleanup(terrain.stage, [overlay.dispose, terrain.dispose]), noteEl };
    };

    const describe = (s: ReturnType<typeof drawStats>): string =>
      `${s.instances} instances · ${s.triangles.toLocaleString()} triangles · ${s.meshes} draw calls (9 tiles)`;

    const near = build(true);
    const far = build(false);
    near.noteEl.textContent = `${describe(drawStats(near.stage))} (loading model…)`;
    far.noteEl.textContent = describe(drawStats(far.stage));

    void waitForDetailMesh(near.stage).then(() => {
      near.noteEl.textContent = describe(drawStats(near.stage));
    });

    return captionedRow([
      { label: `Near — baked model (zoom ≥ ${BARLEY_DETAIL_MIN_ZOOM})`, note: "", element: near.element, noteEl: near.noteEl },
      { label: `Far — flat plane fallback (zoom < ${BARLEY_DETAIL_MIN_ZOOM})`, note: "", element: far.element, noteEl: far.noteEl }
    ]);
  }
};

// A wide block of farmland at the in-game camera angle, on real terrain — whether a mass of tiles
// still reads as a real field, and whether the 90-degree rotation steps are enough to hide that
// every tile is the same mesh. The caption starts with the far-LOD count and updates itself once
// the model has loaded.
export const DenseFarmland: Story = {
  render: () => {
    const radius = 5;
    const terrain = realTerrainStage({ cameraDistance: 14, halfW: radius + 2, halfH: radius + 2 });
    const side = radius * 2 + 1;
    const overlay = createBarleyFieldOverlay(terrain.stage.scene, side * side);
    for (let gz = -radius; gz <= radius; gz += 1) {
      for (let gx = -radius; gx <= radius; gx += 1) {
        const wx = CENTER + gx;
        const wy = CENTER + gz;
        const p = terrain.placementAt(wx, wy);
        overlay.addInstance(p.sceneX, p.sceneZ, p.surfaceY, wx, wy);
      }
    }
    overlay.commit();

    const describe = (): string => {
      const stats = drawStats(terrain.stage);
      return (
        `${stats.instances} instances · ${stats.triangles.toLocaleString()} triangles · ${stats.meshes} draw calls — ` +
        `one InstancedMesh draws every tile's baked model in a single call, versus 10 preallocated InstancedMeshes (8 shells + 2 soil mounds) the earlier procedural version used.`
      );
    };

    const noteEl = document.createElement("div");
    noteEl.textContent = `${describe()} (loading model…)`;
    void waitForDetailMesh(terrain.stage).then(() => {
      noteEl.textContent = describe();
    });

    return captionedRow([
      {
        label: `${side * side} farm tiles at the game camera`,
        note: "",
        noteEl,
        element: wrapWithCleanup(terrain.stage, [overlay.dispose, terrain.dispose])
      }
    ]);
  }
};

// A farmstead built on top of a Fertile Field, on real terrain — the in-game combination for an
// upgraded farm tile (barn + silo + fence on the crop model).
export const FarmsteadOnField: Story = {
  render: () => {
    const terrain = realTerrainStage({ cameraDistance: 6, halfW: 3, halfH: 3 });
    const field = createBarleyFieldOverlay(terrain.stage.scene, 1);
    const p = terrain.placementAt(CENTER, CENTER);
    field.addInstance(p.sceneX, p.sceneZ, p.surfaceY, CENTER, CENTER);
    field.commit();
    const contactShadows = createContactShadowOverlay(terrain.stage.scene, 1);
    const structures = createStructureOverlay(terrain.stage.scene, 1, contactShadows);
    structures.addInstance(p.sceneX, p.sceneZ, p.surfaceY, "FARMSTEAD" as StructureKind);
    structures.commit();
    return wrapWithCleanup(terrain.stage, [field.dispose, structures.dispose, contactShadows.dispose, terrain.dispose]);
  }
};
