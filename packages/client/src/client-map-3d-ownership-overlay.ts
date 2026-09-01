import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MultiplyBlending,
  Scene
} from "three";
import { domeFalloff } from "./client-map-3d-hills.js";
import { HEIGHTFIELD_HILLS_ELEVATION_BONUS } from "./client-map-3d-heightfield/client-map-3d-heightfield.js";

// Blends a fully-saturated owner color toward white by (1 - opacity), so a
// straight multiply against whatever's already in the framebuffer (the
// ground mesh's own lit-and-shadowed color, drawn first) reproduces the same
// look the old alpha blend gave on a FULLY-LIT tile, while a shadowed tile's
// darker ground color now multiplies through instead of being buried under
// the flat tint. See the addTile/addHillTile call sites below for why this
// needs to be baked into the vertex color rather than left to a shader.
const lerpTowardWhite = (component: number, opacity: number): number => 1 + opacity * (component - 1);

const VERTS_PER_TILE = 4;
const INDICES_PER_TILE = 6;

// Hill tiles drape the overlay over the terrain dome's own curve (see
// domeFalloff) instead of bridging it with one flat plane, which used to
// leave the dome poking through the overlay's edge or, worse, sitting
// entirely buried under the hill (only the flat quad's corners, outside the
// dome's DOME_RADIUS, ever matched the visible surface). Matches the
// terrain mesh's own SUBDIV exactly (client-map-3d-hills.ts) rather than
// approximating it at a coarser resolution: same per-vertex domeFalloff
// sample points, same triangle diagonal split, so this surface is a
// constant-offset parallel of the real dome everywhere (not just at
// shared vertices) — required now that the overlay renders with normal
// depth testing and needs to never dip below the opaque terrain.
const HILL_SUBDIV = 10;
const HILL_VERTS_PER_TILE = (HILL_SUBDIV + 1) * (HILL_SUBDIV + 1);
const HILL_INDICES_PER_TILE = HILL_SUBDIV * HILL_SUBDIV * 6;
// Small clearance above the dome's own surface height so the two coincident
// meshes don't z-fight.
const HILL_DRAPE_CLEARANCE = 0.012;
// Hills are a minority terrain type by world-gen design (see
// client-map-3d-hills.ts) -- budgeting for every visible tile being a hill
// would multiply this buffer ~12x for no realistic scenario. This cap is
// generous relative to actual hill density and can be raised if it's ever
// hit in practice (an assertion-free clamp, so overflow just stops drawing
// extra hill tiles rather than crashing).
const DEFAULT_MAX_HILL_TILES = 2000;

// Settled keeps the strong claim color (0.85) so owned territory reads
// unambiguously. Frontier was previously dropped to 0.32 to let biome detail
// show through, but on grass terrain that reads as visually indistinguishable
// from unowned land (confirmed live: a tile with correct owner data and
// ownershipState FRONTIER rendered with no visible tint at 0.32). Raised to
// 0.5 to keep frontier reliably distinct from unowned tiles across biomes.
const SETTLED_OPACITY = 0.85;
// Exported so the waypoint claim-sweep in client-map-3d.ts matches the
// real ownership tint exactly — any drift would show as a visible pop
// the moment the sweep hands off to the ownership overlay.
export const FRONTIER_OPACITY = 0.5;

export type OwnershipOverlay = {
  readonly settledMesh: Mesh;
  readonly frontierMesh: Mesh;
  readonly clear: () => void;
  // Returns the tile's ordinal index within its bucket (frontier vs settled),
  // or -1 if the bucket is already at capacity -- callers that need to
  // re-color this exact tile later without a full rebuild (see
  // setFrontierTileColor) must capture this return value at insert time.
  readonly addTile: (
    corner00X: number, corner00Y: number, corner00Z: number,
    corner10X: number, corner10Y: number, corner10Z: number,
    corner01X: number, corner01Y: number, corner01Z: number,
    corner11X: number, corner11Y: number, corner11Z: number,
    color: Color,
    isFrontier: boolean
  ) => number;
  // Same footprint as addTile (an axis-aligned tile spanning x0..x1,z0..z1),
  // but corner*Y are *ground* height only (no hill bonus) -- the dome bump
  // is added per-vertex internally so the overlay traces the same curve as
  // the hill mesh itself, rather than one flat plane between the corners.
  // Return value is the hill bucket's own ordinal index (see addTile).
  readonly addHillTile: (
    x0: number, x1: number, z0: number, z1: number,
    corner00Y: number, corner10Y: number, corner01Y: number, corner11Y: number,
    color: Color,
    isFrontier: boolean
  ) => number;
  // Partial-update path for animating a single already-committed frontier
  // tile's color every frame (e.g. the out-of-reach decay pulse) without
  // paying for a full rebuild -- writes straight into the existing color
  // buffer and marks only that tile's vertex range dirty. No-ops silently
  // on a stale/out-of-range index (e.g. the tile's bucket was cleared and
  // rebuilt since the index was captured). Call beginFrontierColorUpdates()
  // once before each batch (see its own doc comment).
  readonly beginFrontierColorUpdates: () => void;
  readonly setFrontierTileColor: (index: number, color: Color) => void;
  readonly setFrontierHillTileColor: (index: number, color: Color) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const createMesh = (vertCount: number, indexCount: number, opacity: number): {
  geometry: BufferGeometry;
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  mesh: Mesh;
  material: MeshBasicMaterial;
  opacity: number;
} => {
  const geometry = new BufferGeometry();
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(indexCount);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const material = new MeshBasicMaterial({ toneMapped: false,
    color: "#ffffff",
    vertexColors: true,
    // MultiplyBlending, not the default alpha (NormalBlending) blend this
    // used before: a straight alpha blend at this overlay's opacity (0.85
    // settled / 0.5 frontier) puts 85%/50% weight on the flat, unlit tint
    // color and only 15%/50% on whatever the ground mesh actually rendered
    // underneath -- so a tile's real cast shadow (a much darker ground
    // pixel, now that the ground receives real shadows) barely showed
    // through the tint at all, especially on settled tiles. Multiply lets
    // the ground's actual lit-or-shadowed color come through in full; the
    // vertex colors written below are pre-lerped toward white by this
    // opacity so a fully-lit tile still reproduces the old alpha-blended
    // look almost exactly (see lerpTowardWhite's doc comment) while a
    // shadowed one now visibly darkens instead of reading as flat as ever.
    // `transparent: true` is kept anyway (not for its alpha math, which
    // MultiplyBlending's GL blend func doesn't use) so this still renders
    // in the transparent pass, after the opaque ground has already drawn
    // the color this needs to multiply against.
    transparent: true,
    blending: MultiplyBlending,
    depthWrite: false,
    // depthTest was previously disabled to keep the overlay visible on
    // top of hill domes, back when hill tiles used one flat bridging
    // plane that sank below the dome's peak. addHillTile now drapes the
    // overlay as a constant-offset parallel of the dome's own mesh (same
    // SUBDIV, same per-vertex formula, same triangulation — see
    // HILL_SUBDIV above), so it always sits above the terrain and depth
    // testing can stay on. With it off, the overlay ignored the depth
    // buffer entirely and painted over every opaque object on screen —
    // including towns/structures standing on the tile — tinting them
    // instead of just the ground beneath them.
    side: DoubleSide
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  return { geometry, positions, colors, indices, mesh, material, opacity };
};

export const createOwnershipOverlay = (
  scene: Scene,
  maxTiles: number,
  opacities?: { settled: number; frontier: number },
  maxHillTiles: number = Math.min(maxTiles, DEFAULT_MAX_HILL_TILES)
): OwnershipOverlay => {
  const settled = createMesh(maxTiles * VERTS_PER_TILE, maxTiles * INDICES_PER_TILE, opacities?.settled ?? SETTLED_OPACITY);
  settled.mesh.renderOrder = 6;
  const frontier = createMesh(maxTiles * VERTS_PER_TILE, maxTiles * INDICES_PER_TILE, opacities?.frontier ?? FRONTIER_OPACITY);
  frontier.mesh.renderOrder = 7;
  const settledHill = createMesh(maxHillTiles * HILL_VERTS_PER_TILE, maxHillTiles * HILL_INDICES_PER_TILE, opacities?.settled ?? SETTLED_OPACITY);
  settledHill.mesh.renderOrder = 6;
  const frontierHill = createMesh(maxHillTiles * HILL_VERTS_PER_TILE, maxHillTiles * HILL_INDICES_PER_TILE, opacities?.frontier ?? FRONTIER_OPACITY);
  frontierHill.mesh.renderOrder = 7;
  scene.add(settled.mesh, frontier.mesh, settledHill.mesh, frontierHill.mesh);

  let settledCount = 0;
  let frontierCount = 0;
  let settledHillCount = 0;
  let frontierHillCount = 0;

  const clear = (): void => {
    settledCount = 0;
    frontierCount = 0;
    settledHillCount = 0;
    frontierHillCount = 0;
  };

  const addTile = (
    corner00X: number, corner00Y: number, corner00Z: number,
    corner10X: number, corner10Y: number, corner10Z: number,
    corner01X: number, corner01Y: number, corner01Z: number,
    corner11X: number, corner11Y: number, corner11Z: number,
    color: Color,
    isFrontier: boolean
  ): number => {
    const target = isFrontier ? frontier : settled;
    const count = isFrontier ? frontierCount : settledCount;
    if (count >= maxTiles) return -1;

    const baseVertex = count * VERTS_PER_TILE;
    const baseFloat = baseVertex * 3;

    // 4 corners in CCW order: TL (00), TR (10), BL (01), BR (11).
    target.positions[baseFloat + 0] = corner00X;
    target.positions[baseFloat + 1] = corner00Y;
    target.positions[baseFloat + 2] = corner00Z;
    target.positions[baseFloat + 3] = corner10X;
    target.positions[baseFloat + 4] = corner10Y;
    target.positions[baseFloat + 5] = corner10Z;
    target.positions[baseFloat + 6] = corner01X;
    target.positions[baseFloat + 7] = corner01Y;
    target.positions[baseFloat + 8] = corner01Z;
    target.positions[baseFloat + 9] = corner11X;
    target.positions[baseFloat + 10] = corner11Y;
    target.positions[baseFloat + 11] = corner11Z;

    for (let v = 0; v < VERTS_PER_TILE; v += 1) {
      target.colors[baseFloat + v * 3 + 0] = lerpTowardWhite(color.r, target.opacity);
      target.colors[baseFloat + v * 3 + 1] = lerpTowardWhite(color.g, target.opacity);
      target.colors[baseFloat + v * 3 + 2] = lerpTowardWhite(color.b, target.opacity);
    }

    const baseIndex = count * INDICES_PER_TILE;
    target.indices[baseIndex + 0] = baseVertex + 0;
    target.indices[baseIndex + 1] = baseVertex + 2;
    target.indices[baseIndex + 2] = baseVertex + 1;
    target.indices[baseIndex + 3] = baseVertex + 1;
    target.indices[baseIndex + 4] = baseVertex + 2;
    target.indices[baseIndex + 5] = baseVertex + 3;

    if (isFrontier) frontierCount += 1;
    else settledCount += 1;
    return count;
  };

  const addHillTile = (
    x0: number, x1: number, z0: number, z1: number,
    corner00Y: number, corner10Y: number, corner01Y: number, corner11Y: number,
    color: Color,
    isFrontier: boolean
  ): number => {
    const target = isFrontier ? frontierHill : settledHill;
    const count = isFrontier ? frontierHillCount : settledHillCount;
    if (count >= maxHillTiles) return -1;

    const vertsPerRow = HILL_SUBDIV + 1;
    const baseVertex = count * HILL_VERTS_PER_TILE;
    let vi = baseVertex;
    for (let b = 0; b <= HILL_SUBDIV; b += 1) {
      for (let a = 0; a <= HILL_SUBDIV; a += 1) {
        const fx = a / HILL_SUBDIV;
        const fz = b / HILL_SUBDIV;
        // domeFalloff is radial from the tile's own center, matching
        // client-map-3d-hills.ts exactly.
        const u = fx - 0.5;
        const v = fz - 0.5;
        const r = Math.hypot(u, v);
        const top = corner00Y + (corner10Y - corner00Y) * fx;
        const bottom = corner01Y + (corner11Y - corner01Y) * fx;
        const groundY = top + (bottom - top) * fz;
        const p = vi * 3;
        target.positions[p + 0] = x0 + (x1 - x0) * fx;
        target.positions[p + 1] = groundY + HEIGHTFIELD_HILLS_ELEVATION_BONUS * domeFalloff(r) + HILL_DRAPE_CLEARANCE;
        target.positions[p + 2] = z0 + (z1 - z0) * fz;
        target.colors[p + 0] = lerpTowardWhite(color.r, target.opacity);
        target.colors[p + 1] = lerpTowardWhite(color.g, target.opacity);
        target.colors[p + 2] = lerpTowardWhite(color.b, target.opacity);
        vi += 1;
      }
    }

    const baseIndex = count * HILL_INDICES_PER_TILE;
    let ii = baseIndex;
    for (let b = 0; b < HILL_SUBDIV; b += 1) {
      for (let a = 0; a < HILL_SUBDIV; a += 1) {
        const i00 = baseVertex + b * vertsPerRow + a;
        const i10 = i00 + 1;
        const i01 = i00 + vertsPerRow;
        const i11 = i01 + 1;
        target.indices[ii + 0] = i00; target.indices[ii + 1] = i01; target.indices[ii + 2] = i10;
        target.indices[ii + 3] = i10; target.indices[ii + 4] = i01; target.indices[ii + 5] = i11;
        ii += 6;
      }
    }

    if (isFrontier) frontierHillCount += 1;
    else settledHillCount += 1;
    return count;
  };

  // Deliberately does NOT call clearUpdateRanges() here (it used to).
  // commit() -- called by a rebuild earlier in the same animation frame,
  // whenever the camera pans/zooms into new tiles -- stages its own full
  // 0..vertCount color range and sets needsUpdate, but the GPU upload only
  // happens once, when the renderer actually draws the frame. Clearing the
  // attribute's pending ranges here (once per frame, before the decay-pulse
  // tiles add their own small ranges) discarded that full-range entry
  // whenever a rebuild and a pulse tick landed in the same frame: only the
  // pulse's small ranges reached the GPU, so every tile the rebuild just
  // reassigned to a *different* index kept its previous occupant's stale
  // color on-screen -- exactly the "random frontier tiles glow amber after
  // panning" artifact this was causing. Three.js clears an attribute's
  // updateRanges itself once it has uploaded them, so simply not clearing
  // here and letting addUpdateRange accumulate is safe: commit()'s full
  // range and the pulse's per-tile ranges from the same frame now both
  // survive to the next GPU upload instead of the second writer erasing
  // the first's.
  const beginFrontierColorUpdates = (): void => {};

  const setFrontierTileColor = (index: number, color: Color): void => {
    if (index < 0 || index >= frontierCount) return;
    const baseFloat = index * VERTS_PER_TILE * 3;
    for (let v = 0; v < VERTS_PER_TILE; v += 1) {
      frontier.colors[baseFloat + v * 3 + 0] = lerpTowardWhite(color.r, frontier.opacity);
      frontier.colors[baseFloat + v * 3 + 1] = lerpTowardWhite(color.g, frontier.opacity);
      frontier.colors[baseFloat + v * 3 + 2] = lerpTowardWhite(color.b, frontier.opacity);
    }
    const colorAttr = frontier.geometry.getAttribute("color") as BufferAttribute;
    colorAttr.addUpdateRange(baseFloat, VERTS_PER_TILE * 3);
    colorAttr.needsUpdate = true;
  };

  const setFrontierHillTileColor = (index: number, color: Color): void => {
    if (index < 0 || index >= frontierHillCount) return;
    const baseFloat = index * HILL_VERTS_PER_TILE * 3;
    for (let v = 0; v < HILL_VERTS_PER_TILE; v += 1) {
      frontierHill.colors[baseFloat + v * 3 + 0] = lerpTowardWhite(color.r, frontierHill.opacity);
      frontierHill.colors[baseFloat + v * 3 + 1] = lerpTowardWhite(color.g, frontierHill.opacity);
      frontierHill.colors[baseFloat + v * 3 + 2] = lerpTowardWhite(color.b, frontierHill.opacity);
    }
    const colorAttr = frontierHill.geometry.getAttribute("color") as BufferAttribute;
    colorAttr.addUpdateRange(baseFloat, HILL_VERTS_PER_TILE * 3);
    colorAttr.needsUpdate = true;
  };

  const commit = (): void => {
    settled.geometry.setDrawRange(0, settledCount * INDICES_PER_TILE);
    frontier.geometry.setDrawRange(0, frontierCount * INDICES_PER_TILE);
    settledHill.geometry.setDrawRange(0, settledHillCount * HILL_INDICES_PER_TILE);
    frontierHill.geometry.setDrawRange(0, frontierHillCount * HILL_INDICES_PER_TILE);
    // Buffers are pre-allocated at maxTiles/maxHillTiles (worst case) but
    // only *Count tiles were written this commit — an unranged needsUpdate
    // reuploads the entire buffer via bufferSubData regardless, which
    // dominated the main thread during zoom (bufferSubData was 65% of
    // sampled time in a zoom-gesture CPU profile). Same pattern already
    // fixed for the heightfield skirt buffers; scope the upload here too.
    const targets: Array<{
      target: ReturnType<typeof createMesh>;
      vertCount: number;
      indexCount: number;
    }> = [
      { target: settled, vertCount: settledCount * VERTS_PER_TILE, indexCount: settledCount * INDICES_PER_TILE },
      { target: frontier, vertCount: frontierCount * VERTS_PER_TILE, indexCount: frontierCount * INDICES_PER_TILE },
      { target: settledHill, vertCount: settledHillCount * HILL_VERTS_PER_TILE, indexCount: settledHillCount * HILL_INDICES_PER_TILE },
      { target: frontierHill, vertCount: frontierHillCount * HILL_VERTS_PER_TILE, indexCount: frontierHillCount * HILL_INDICES_PER_TILE }
    ];
    for (const { target, vertCount, indexCount } of targets) {
      const pos = target.geometry.getAttribute("position") as BufferAttribute | undefined;
      const color = target.geometry.getAttribute("color") as BufferAttribute | undefined;
      const index = target.geometry.index;
      if (pos) {
        pos.clearUpdateRanges();
        pos.addUpdateRange(0, vertCount * 3);
        pos.needsUpdate = true;
      }
      if (color) {
        color.clearUpdateRanges();
        color.addUpdateRange(0, vertCount * 3);
        color.needsUpdate = true;
      }
      if (index) {
        index.clearUpdateRanges();
        index.addUpdateRange(0, indexCount);
        index.needsUpdate = true;
      }
    }
  };

  const dispose = (): void => {
    scene.remove(settled.mesh, frontier.mesh, settledHill.mesh, frontierHill.mesh);
    for (const target of [settled, frontier, settledHill, frontierHill]) {
      target.geometry.dispose();
      target.material.dispose();
    }
  };

  return {
    settledMesh: settled.mesh,
    frontierMesh: frontier.mesh,
    clear,
    addTile,
    addHillTile,
    beginFrontierColorUpdates,
    setFrontierTileColor,
    setFrontierHillTileColor,
    commit,
    dispose
  };
};
