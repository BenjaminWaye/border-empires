import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Scene
} from "three";
import { terrainShadeVariantAt } from "./client-map-3d-terrain-variation/client-map-3d-terrain-variation.js";
import {
  heightfieldFlatTileElevation,
  heightfieldTileColor,
  HEIGHTFIELD_HILLS_ELEVATION_BONUS,
  SKIRT_BOTTOM_Y,
  SKIRT_SHADE,
  type HeightfieldTerrainKind
} from "./client-map-3d-heightfield/client-map-3d-heightfield.js";
import { accumulateHeightfieldNormals } from "./client-map-3d-heightfield-normals.js";

// Hills tiles are excluded entirely from the shared-vertex heightfield grid
// (see isHillsAt in client-map-3d-heightfield.ts) — that grid's corner
// averaging would otherwise dilute a lone hills tile's rise to ~1/4 height
// and bleed it into flat neighbours. Instead every hills tile gets its own
// small, independently-subdivided dome mesh, confined to that tile's
// footprint: height follows a smooth radial falloff that peaks at the
// centre and reaches ground level before it ever touches the tile's edges.
//
// Every attribute at the dome's edge is *stitched* to the main grid's real
// data instead of invented locally — same technique used to blend any
// decoration mesh into a base terrain seamlessly:
//  - height: bilinear-blended from the tile's real 4 corner elevations
//    (heightfieldFlatTileElevation), so it matches flat/jittered neighbours
//    exactly, and blends toward sand/grass/etc. the same way the main grid
//    would if this tile weren't a hill.
//  - colour: bilinear-blended from the tile's real 4 corner colours
//    (heightfieldTileColor + terrainShadeVariantAt) the same way, so a hill
//    sitting near a grass/sand border fades correctly instead of showing
//    one fixed biome tint for its whole footprint.
//  - normals: computed by the same bounded accumulator the main grid uses
//    (accumulateHeightfieldNormals), never three.js's own
//    computeVertexNormals(), which ignores drawRange and corrupts normals
//    with stale data from the rest of a mostly-unused preallocated buffer.
//  - material: the *exact same* MeshStandardMaterial instance as the main
//    heightfield (passed in, not created here), so the painted grass/sand
//    textures, normal map and lighting all match exactly. That shared
//    shader expects a world-tile-coordinate `uv` and a `forestZone`
//    attribute (see its onBeforeCompile), both provided below even though
//    hill tops don't participate in the forest halo.
const SUBDIV = 10;
// Exported so other layers that need to trace the dome's exact silhouette
// (e.g. the ownership overlay draping over a hill tile) use the identical
// curve instead of an approximation that would visibly drift from it.
export const HILL_DOME_RADIUS = 0.46;
export const HILL_CORE_RADIUS = 0.14;
const DOME_RADIUS = HILL_DOME_RADIUS;
const CORE_RADIUS = HILL_CORE_RADIUS;

const hillPeakBonus = (): number => HEIGHTFIELD_HILLS_ELEVATION_BONUS;

// Flat plateau of 1 out to CORE_RADIUS (a pure single-point peak always
// reads as a cone tip), then a smoothstep shoulder to 0 at DOME_RADIUS —
// comfortably inside the tile's own edges (0.5) and corners (~0.707), so
// the dome never touches the tile boundary at full height.
export const domeFalloff = (r: number): number => {
  if (r <= CORE_RADIUS) return 1;
  const t = Math.min(1, Math.max(0, 1 - (r - CORE_RADIUS) / (DOME_RADIUS - CORE_RADIUS)));
  return t * t * (3 - 2 * t);
};

const wrap = (n: number, dim: number): number => {
  const m = n % dim;
  return m < 0 ? m + dim : m;
};

export type HillTerrainRebuildInputs = {
  readonly camX: number;
  readonly camY: number;
  readonly halfW: number;
  readonly halfH: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly tileKindAt: (wx: number, wy: number) => HeightfieldTerrainKind;
  readonly isExploredAt?: (wx: number, wy: number) => boolean;
  readonly isHillsAt: (wx: number, wy: number) => boolean;
};

export type HillTerrain = {
  readonly mesh: Mesh;
  readonly rebuild: (inputs: HillTerrainRebuildInputs) => void;
  readonly dispose: () => void;
};

// `sharedMaterial` must be the main heightfield's own material instance —
// see the module comment above.
export const createHillTerrain = (scene: Scene, maxTiles: number, sharedMaterial: MeshStandardMaterial): HillTerrain => {
  const vertsPerTile = (SUBDIV + 1) * (SUBDIV + 1);
  const indicesPerTile = SUBDIV * SUBDIV * 6;
  const positions = new Float32Array(maxTiles * vertsPerTile * 3);
  const colors = new Float32Array(maxTiles * vertsPerTile * 3);
  const uvs = new Float32Array(maxTiles * vertsPerTile * 2);
  const forestZones = new Float32Array(maxTiles * vertsPerTile);
  // The shared material's fragment shader (client-map-3d-heightfield.ts's
  // onBeforeCompile) reads a `tundraZone` attribute to pick the TUNDRA
  // texture explicitly rather than inferring it from vertex color — without
  // this, a TUNDRA dome's bilinear-blended pale color reads as SAND in that
  // color-inferred fallback (its greenBias lands just below the grass
  // threshold), same misclassification risk the main grid's own tundraZone
  // was added to avoid.
  const tundraZones = new Float32Array(maxTiles * vertsPerTile);
  // Own normals buffer, filled by accumulateHeightfieldNormals (bounded by
  // the *actual* index count) — never geometry.computeVertexNormals(),
  // which walks the whole preallocated index attribute regardless of
  // setDrawRange() and corrupts real vertices with stale/degenerate data.
  const normals = new Float32Array(maxTiles * vertsPerTile * 3);
  const indices = new Uint32Array(maxTiles * indicesPerTile);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
  geometry.setAttribute("forestZone", new BufferAttribute(forestZones, 1));
  geometry.setAttribute("tundraZone", new BufferAttribute(tundraZones, 1));
  geometry.setAttribute("normal", new BufferAttribute(normals, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);
  const mesh = new Mesh(geometry, sharedMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // A hill dome has zero thickness at its own edge, same as the main
  // heightfield grid — see SKIRT_BOTTOM_Y's comment in
  // client-map-3d-heightfield.ts for the "black crack at grazing angles"
  // failure mode this prevents. The main grid's own skirt pass explicitly
  // excludes hills tiles (they aren't part of that grid at all), so without
  // this, a hill bordering sea or unexplored territory had no wall bridging
  // its edge down to a safe depth — this is what "tiles lost their bottoms"
  // in the reported bug actually was.
  //
  // One quad per tile-edge, not one per SUBDIV segment: the dome's own
  // boundary ring is flat (domeFalloff is 0 at r >= HILL_DOME_RADIUS, well
  // inside the tile edge at r=0.5), so a straight line between the tile's
  // two real corner values is geometrically exact, not an approximation —
  // matching the main grid's own per-tile-edge skirt granularity instead of
  // the dome surface's SUBDIV=10, which keeps this buffer's cost in the
  // same ballpark as the main grid's skirt rather than 10x larger.
  const maxHillSkirtEdges = maxTiles * 4;
  const skirtPositions = new Float32Array(maxHillSkirtEdges * 4 * 3);
  const skirtColors = new Float32Array(maxHillSkirtEdges * 4 * 3);
  const skirtNormals = new Float32Array(maxHillSkirtEdges * 4 * 3);
  const skirtIndices = new Uint32Array(maxHillSkirtEdges * 6);
  const skirtGeometry = new BufferGeometry();
  skirtGeometry.setAttribute("position", new BufferAttribute(skirtPositions, 3));
  skirtGeometry.setAttribute("color", new BufferAttribute(skirtColors, 3));
  skirtGeometry.setAttribute("normal", new BufferAttribute(skirtNormals, 3));
  skirtGeometry.setIndex(new BufferAttribute(skirtIndices, 1));
  skirtGeometry.setDrawRange(0, 0);
  // Matches the main grid's own skirt material exactly (see skirtMaterial in
  // client-map-3d-heightfield.ts) — same unlit-feeling flat response, same
  // double-sided draw so it's covered from both directions of grazing angle.
  const skirtMaterial = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: DoubleSide
  });
  const skirtMesh = new Mesh(skirtGeometry, skirtMaterial);
  skirtMesh.frustumCulled = false;
  skirtMesh.receiveShadow = false;
  skirtMesh.castShadow = false;
  scene.add(skirtMesh);

  const rebuild = (inputs: HillTerrainRebuildInputs): void => {
    const { camX, camY, halfW, halfH, worldWidth, worldHeight, tileKindAt, isExploredAt, isHillsAt } = inputs;
    const exploredAt = isExploredAt ?? ((): boolean => true);

    let vertCount = 0;
    let idxCount = 0;

    const spanX = Math.max(2, 2 * halfW + 3);
    const spanY = Math.max(2, 2 * halfH + 3);
    const offsetX = -Math.floor(spanX / 2);
    const offsetY = -Math.floor(spanY / 2);

    // A neighbour only counts toward a shared corner's flat value if the
    // main grid would also count it there: explored, not sea, not itself a
    // hills tile (mirrors that grid's s00Land predicate exactly).
    const countsAsFlatLand = (nwx: number, nwy: number): boolean => {
      if (!exploredAt(nwx, nwy)) return false;
      const nk = tileKindAt(nwx, nwy);
      if (nk === "SEA" || nk === "COASTAL_SEA") return false;
      if ((nk === "GRASS" || nk === "SAND" || nk === "TUNDRA") && isHillsAt(nwx, nwy)) return false;
      return true;
    };
    // Real ground elevation/colour at world grid corner (cx, cz), averaged
    // over whichever of its 4 tiles count as flat land — the exact value
    // the main grid renders there, so a dome edge lines up with no seam.
    //
    // `fallback` is this dome's *own* tile's elevation/colour, used only if
    // count is still 0 after both loops above. In practice this dome's own
    // tile is always one of the 4 cells the second loop checks at each of
    // its 4 corners, and the outer per-tile loop above already requires
    // exploredAt(wx, wy) to be true to reach this point at all — so that
    // second loop always finds at least this tile itself, and count never
    // actually reaches 0 for a hill's own corners today. This fallback was
    // originally suspected as the cause of "tiles lost their bottoms" (a
    // hardcoded { e: 0, r: 0, g: 0, b: 0 } sat here before), but that theory
    // didn't survive a test: a hill tile surrounded entirely by unexplored
    // territory still resolved every corner through the self-count above,
    // never reaching this line. Kept anyway as defensive correctness — a
    // real fallback beats a hardcoded black one if some future refactor
    // changes who calls flatCorner or how — but the actual fix for the
    // reported bug is the skirt below, not this.
    const flatCorner = (
      cx: number,
      cz: number,
      fallback: { e: number; r: number; g: number; b: number; t: number }
    ): { e: number; r: number; g: number; b: number; t: number } => {
      let sumE = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumT = 0;
      let count = 0;
      for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const nwx = wrap(cx + dx, worldWidth);
        const nwz = wrap(cz + dz, worldHeight);
        if (!countsAsFlatLand(nwx, nwz)) continue;
        const nk = tileKindAt(nwx, nwz);
        const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
        sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
        sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
        sumT += nk === "TUNDRA" ? 1 : 0;
        count += 1;
      }
      if (count === 0) {
        // No flat-land neighbour at all (deep inside a hills cluster) —
        // fall back to whatever explored tiles do touch it, so at least
        // every hill touching this corner agrees with the others.
        for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          const nwx = wrap(cx + dx, worldWidth);
          const nwz = wrap(cz + dz, worldHeight);
          if (!exploredAt(nwx, nwz)) continue;
          const nk = tileKindAt(nwx, nwz);
          const [nr, ng, nb] = heightfieldTileColor(nk, terrainShadeVariantAt(nwx, nwz));
          sumE += heightfieldFlatTileElevation(nwx, nwz, nk);
          sumR += nr / 255; sumG += ng / 255; sumB += nb / 255;
          sumT += nk === "TUNDRA" ? 1 : 0;
          count += 1;
        }
      }
      if (count === 0) return fallback;
      const inv = 1 / count;
      return { e: sumE * inv, r: sumR * inv, g: sumG * inv, b: sumB * inv, t: sumT * inv };
    };

    // Mirrors isHole in client-map-3d-heightfield.ts's own skirt pass
    // exactly: a hills-tile neighbour is not a hole (the neighbouring dome
    // covers its own footprint fully, no wall needed at that shared edge),
    // only sea and unexplored territory are.
    const isHole = (nwx: number, nwy: number): boolean => {
      const wnwx = wrap(nwx, worldWidth);
      const wnwy = wrap(nwy, worldHeight);
      if (!exploredAt(wnwx, wnwy)) return true;
      const nk = tileKindAt(wnwx, wnwy);
      return nk === "SEA" || nk === "COASTAL_SEA";
    };

    let skirtVertCount = 0;
    let skirtIdxCount = 0;
    const emitHillSkirtEdge = (
      ax: number, az: number, ay: number, ar: number, ag: number, ab: number,
      bx: number, bz: number, by: number, br: number, bg: number, bb: number
    ): void => {
      if (skirtVertCount + 4 > maxHillSkirtEdges * 4) return;
      const base = skirtVertCount;
      const p = base * 3;
      skirtPositions[p + 0] = ax; skirtPositions[p + 1] = ay; skirtPositions[p + 2] = az;
      skirtPositions[p + 3] = bx; skirtPositions[p + 4] = by; skirtPositions[p + 5] = bz;
      skirtPositions[p + 6] = ax; skirtPositions[p + 7] = SKIRT_BOTTOM_Y; skirtPositions[p + 8] = az;
      skirtPositions[p + 9] = bx; skirtPositions[p + 10] = SKIRT_BOTTOM_Y; skirtPositions[p + 11] = bz;
      skirtColors[p + 0] = ar; skirtColors[p + 1] = ag; skirtColors[p + 2] = ab;
      skirtColors[p + 3] = br; skirtColors[p + 4] = bg; skirtColors[p + 5] = bb;
      skirtColors[p + 6] = ar * SKIRT_SHADE; skirtColors[p + 7] = ag * SKIRT_SHADE; skirtColors[p + 8] = ab * SKIRT_SHADE;
      skirtColors[p + 9] = br * SKIRT_SHADE; skirtColors[p + 10] = bg * SKIRT_SHADE; skirtColors[p + 11] = bb * SKIRT_SHADE;
      // Flat quad normal, same approximation as the main grid's own skirt:
      // perpendicular to the top edge in the XZ plane, ignoring the
      // (usually tiny) top-edge Y slope — a thin wall seen edge-on doesn't
      // need more.
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = dz / len;
      const nz = -dx / len;
      skirtNormals[p + 0] = nx; skirtNormals[p + 1] = 0; skirtNormals[p + 2] = nz;
      skirtNormals[p + 3] = nx; skirtNormals[p + 4] = 0; skirtNormals[p + 5] = nz;
      skirtNormals[p + 6] = nx; skirtNormals[p + 7] = 0; skirtNormals[p + 8] = nz;
      skirtNormals[p + 9] = nx; skirtNormals[p + 10] = 0; skirtNormals[p + 11] = nz;
      skirtIndices[skirtIdxCount++] = base + 0;
      skirtIndices[skirtIdxCount++] = base + 2;
      skirtIndices[skirtIdxCount++] = base + 1;
      skirtIndices[skirtIdxCount++] = base + 1;
      skirtIndices[skirtIdxCount++] = base + 2;
      skirtIndices[skirtIdxCount++] = base + 3;
      skirtVertCount += 4;
    };

    for (let dj = 0; dj < spanY; dj += 1) {
      for (let di = 0; di < spanX; di += 1) {
        const wx = wrap(camX + offsetX + di, worldWidth);
        const wy = wrap(camY + offsetY + dj, worldHeight);
        if (!exploredAt(wx, wy)) continue;
        const kind = tileKindAt(wx, wy);
        if ((kind !== "GRASS" && kind !== "SAND" && kind !== "TUNDRA") || !isHillsAt(wx, wy)) continue;
        if (vertCount + vertsPerTile > maxTiles * vertsPerTile || idxCount + indicesPerTile > indices.length) continue;

        const peak = hillPeakBonus();
        const tileX = offsetX + di;
        const tileZ = offsetY + dj;
        // This dome's own ground elevation/colour, used as flatCorner's
        // last-resort fallback (see its comment) instead of hardcoded black.
        const [ownR, ownG, ownB] = heightfieldTileColor(kind, terrainShadeVariantAt(wx, wy));
        const ownFallback = {
          e: heightfieldFlatTileElevation(wx, wy, kind),
          r: ownR / 255,
          g: ownG / 255,
          b: ownB / 255,
          t: kind === "TUNDRA" ? 1 : 0
        };
        // This tile's 4 real corner values (height + colour), matching
        // the main grid exactly.
        const cTL = flatCorner(wx, wy, ownFallback);
        const cTR = flatCorner(wx + 1, wy, ownFallback);
        const cBL = flatCorner(wx, wy + 1, ownFallback);
        const cBR = flatCorner(wx + 1, wy + 1, ownFallback);

        // Same 4-cardinal-neighbour pattern as the main grid's own skirt
        // pass (client-map-3d-heightfield.ts): a wall wherever this tile's
        // edge borders a hole, using the tile's own real corner data so the
        // wall's top edge lines up with the dome exactly, no seam.
        if (isHole(wx, wy - 1)) emitHillSkirtEdge(tileX, tileZ, cTL.e, cTL.r, cTL.g, cTL.b, tileX + 1, tileZ, cTR.e, cTR.r, cTR.g, cTR.b);
        if (isHole(wx, wy + 1)) emitHillSkirtEdge(tileX, tileZ + 1, cBL.e, cBL.r, cBL.g, cBL.b, tileX + 1, tileZ + 1, cBR.e, cBR.r, cBR.g, cBR.b);
        if (isHole(wx - 1, wy)) emitHillSkirtEdge(tileX, tileZ + 1, cBL.e, cBL.r, cBL.g, cBL.b, tileX, tileZ, cTL.e, cTL.r, cTL.g, cTL.b);
        if (isHole(wx + 1, wy)) emitHillSkirtEdge(tileX + 1, tileZ, cTR.e, cTR.r, cTR.g, cTR.b, tileX + 1, tileZ + 1, cBR.e, cBR.r, cBR.g, cBR.b);

        const base = vertCount;
        for (let b = 0; b <= SUBDIV; b += 1) {
          for (let a = 0; a <= SUBDIV; a += 1) {
            const u = a / SUBDIV - 0.5;
            const v = b / SUBDIV - 0.5;
            const r = Math.hypot(u, v);
            const fx = u + 0.5;
            const fz = v + 0.5;
            // Bilinear blend of the 4 real corners, for both height and
            // colour, then the dome bump added on top of the ground level.
            const eTop = cTL.e + (cTR.e - cTL.e) * fx;
            const eBottom = cBL.e + (cBR.e - cBL.e) * fx;
            const groundY = eTop + (eBottom - eTop) * fz;
            const rTop = cTL.r + (cTR.r - cTL.r) * fx;
            const rBottom = cBL.r + (cBR.r - cBL.r) * fx;
            const cr = rTop + (rBottom - rTop) * fz;
            const gTop = cTL.g + (cTR.g - cTL.g) * fx;
            const gBottom = cBL.g + (cBR.g - cBL.g) * fx;
            const cg = gTop + (gBottom - gTop) * fz;
            const bTop = cTL.b + (cTR.b - cTL.b) * fx;
            const bBottom = cBL.b + (cBR.b - cBL.b) * fx;
            const cb = bTop + (bBottom - bTop) * fz;
            const tTop = cTL.t + (cTR.t - cTL.t) * fx;
            const tBottom = cBL.t + (cBR.t - cBL.t) * fx;
            const ct = tTop + (tBottom - tTop) * fz;

            const vi = vertCount;
            const p = vi * 3;
            positions[p + 0] = tileX + 0.5 + u;
            positions[p + 1] = groundY + peak * domeFalloff(r);
            positions[p + 2] = tileZ + 0.5 + v;
            colors[p + 0] = cr;
            colors[p + 1] = cg;
            colors[p + 2] = cb;
            tundraZones[vi] = ct;
            // World-tile-coordinate UV (matches the main heightfield's
            // convention) so the shared material's painted texture blend
            // samples the same painterly grass/sand look, not a flat tint.
            const uvi = vi * 2;
            uvs[uvi + 0] = camX + tileX + 0.5 + u;
            uvs[uvi + 1] = camY + tileZ + 0.5 + v;
            vertCount += 1;
          }
        }
        for (let b = 0; b < SUBDIV; b += 1) {
          for (let a = 0; a < SUBDIV; a += 1) {
            const rowStride = SUBDIV + 1;
            const i0 = base + b * rowStride + a;
            const i1 = i0 + 1;
            const i2 = i0 + rowStride;
            const i3 = i2 + 1;
            indices[idxCount++] = i0;
            indices[idxCount++] = i2;
            indices[idxCount++] = i1;
            indices[idxCount++] = i1;
            indices[idxCount++] = i2;
            indices[idxCount++] = i3;
          }
        }
      }
    }

    accumulateHeightfieldNormals(positions, indices, idxCount, normals, vertCount);

    const posAttr = geometry.getAttribute("position");
    const colorAttr = geometry.getAttribute("color");
    const uvAttr = geometry.getAttribute("uv");
    const normalAttr = geometry.getAttribute("normal");
    const tundraZoneAttr = geometry.getAttribute("tundraZone");
    if (posAttr) (posAttr as BufferAttribute).needsUpdate = true;
    if (colorAttr) (colorAttr as BufferAttribute).needsUpdate = true;
    if (uvAttr) (uvAttr as BufferAttribute).needsUpdate = true;
    if (normalAttr) (normalAttr as BufferAttribute).needsUpdate = true;
    if (tundraZoneAttr) (tundraZoneAttr as BufferAttribute).needsUpdate = true;
    const indexAttr = geometry.index;
    if (indexAttr) indexAttr.needsUpdate = true;
    geometry.setDrawRange(0, idxCount);

    // Ranged upload, unlike the dome buffers just above: this skirt buffer
    // is sized for maxHillSkirtEdges (the worst case of every hill tile
    // needing a wall on all 4 sides), but only skirtVertCount*3 of it was
    // actually written this rebuild. An unranged needsUpdate here would
    // reupload the whole preallocated buffer via bufferSubData every
    // rebuild regardless of how few tiles actually border a hole — exactly
    // the cost pattern client-map-3d-heightfield.ts's own skirt had to be
    // fixed to avoid (see its comment on the same technique).
    const skirtItemCount = skirtVertCount * 3;
    const skirtPosAttr = skirtGeometry.getAttribute("position") as BufferAttribute | undefined;
    const skirtColorAttr = skirtGeometry.getAttribute("color") as BufferAttribute | undefined;
    const skirtNormalAttr = skirtGeometry.getAttribute("normal") as BufferAttribute | undefined;
    const skirtIndexAttr = skirtGeometry.index;
    if (skirtPosAttr) {
      skirtPosAttr.clearUpdateRanges();
      skirtPosAttr.addUpdateRange(0, skirtItemCount);
      skirtPosAttr.needsUpdate = true;
    }
    if (skirtColorAttr) {
      skirtColorAttr.clearUpdateRanges();
      skirtColorAttr.addUpdateRange(0, skirtItemCount);
      skirtColorAttr.needsUpdate = true;
    }
    if (skirtNormalAttr) {
      skirtNormalAttr.clearUpdateRanges();
      skirtNormalAttr.addUpdateRange(0, skirtItemCount);
      skirtNormalAttr.needsUpdate = true;
    }
    if (skirtIndexAttr) {
      skirtIndexAttr.clearUpdateRanges();
      skirtIndexAttr.addUpdateRange(0, skirtIdxCount);
      skirtIndexAttr.needsUpdate = true;
    }
    skirtGeometry.setDrawRange(0, skirtIdxCount);
  };

  // sharedMaterial is owned (and disposed) by the main heightfield, not
  // this module. skirtMaterial is owned here — it's a plain vertex-colored
  // material created fresh for this skirt, unlike sharedMaterial.
  const dispose = (): void => {
    scene.remove(mesh);
    geometry.dispose();
    scene.remove(skirtMesh);
    skirtGeometry.dispose();
    skirtMaterial.dispose();
  };

  return { mesh, rebuild, dispose };
};
