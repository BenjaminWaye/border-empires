# glTF Structure Model Pipeline — Plan

Status: **proposed, not implemented.** No model loader exists in the client today.

## Why this is smaller than it looks

Every 3D structure today is procedural Three.js geometry registered through
`createStructurePieceBuilder` (`packages/client/src/client-map-3d-structure-builder.ts`).
That builder already has exactly the shape a glTF pipeline needs:

- `makeSlot(key, geometry, material, capacity)` creates one `InstancedMesh`.
- `addPiece(key, sceneX, surfaceY, sceneZ, ox, oy, oz, sx, sy, sz, rotY, rotX, rotZ)`
  writes one instance matrix.
- The orchestrator (`client-map-3d-structure-overlay.ts`) owns `clear()` / `commit()`
  and a `layouts[kind]` dispatch table.

A glTF file decomposes into the same units: **each mesh primitive is one
(geometry, material) pair — i.e. exactly one slot.** So model support is an
*adapter* that turns a loaded `.glb` into `makeSlot` calls plus a generated
layout function. No changes to the render loop, instancing, commit path, or
disposal are required.

This is the core reason glTF support is worth doing here: we keep one draw call
per material regardless of how many copies of a structure are on screen.

## Performance constraints this design must respect

1. **`mesh.frustumCulled = false`** on every slot (builder line ~95). Slots are
   always submitted to the GPU whether or not anything is visible. Therefore
   **materials per model == permanent draw calls**, and that — not triangle
   count — is the budget that matters most.
2. **Capacity is preallocated** as `maxTiles` (or a small multiple) per slot.
   Each slot allocates a `maxTiles × 16` float instance matrix buffer up front,
   so every extra slot costs memory even when unused.
3. **Mobile is a first-class target** (touch pan/pinch, drawer nav). VRAM and
   draw-call budget are tightest there.
4. Download weight is new cost that procedural geometry does not pay at all.

## Phases

### Phase 1 — Loader + adapter (no art change)
- Add `GLTFLoader` (ships in `three/examples/jsm`, already a dependency — no new package).
- New `client-map-3d-structure-gltf-loader.ts`: fetch + parse a `.glb`, validate it
  against the budget (below), return typed `{ geometry, material, localMatrix }[]`.
- Widen `StructurePieceGeometry` to `BufferGeometry` in the builder (it already
  imports `BufferGeometry` for `ownedGeos`, so disposal is unchanged).
- Adapter `registerGltfStructure(builder, kind, parsed)` → one `makeSlot` per
  primitive + a layout closure that `addPiece`s each primitive at its authored
  local transform.

### Phase 2 — Progressive swap-in
Slots can be created after init (`makeSlot` starts at `count = 0`, so a new slot
renders nothing until a layout writes to it). That enables a clean fallback:

- Procedural layout registers at startup and renders immediately.
- When a model finishes loading, atomically swap `layouts[kind]` to the glTF version.
- Load failure, a budget violation, or a low-end device simply never swaps, and
  the procedural structure remains.

This means **no blank tiles, no hard dependency on the CDN, and an automatic
low-end path** — worth building in Phase 2 rather than retrofitting.

### Phase 3 — Budget enforcement in CI
- `pnpm check:model-budget`: walks `packages/client/public/models/*.glb` and fails
  on triangle count, primitive/material count, file size, or bounding-box overrun.
- Treat it like `check:file-lines` — a hard local gate, since there is no GitHub CI.

### Phase 4 — Art migration, one structure at a time
Migrate per structure kind, not wholesale. Each migration is independently
revertable because the procedural layout stays in the tree until the model proves out.

## Open questions
- Hosting: bundle via Vite `public/` (simple, cached with the deploy) vs. a CDN
  (better cache lifetime across deploys). Start with `public/`.
- Whether `contactShadows.addShadow`'s fixed `DEFAULT_CONTACT_SHADOW_RADIUS_TILES`
  should become per-model, derived from the glTF bounding box.
