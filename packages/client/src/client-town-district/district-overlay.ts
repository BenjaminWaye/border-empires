import { InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type Scene, type Texture } from "three";
import { tickTownTime } from "../client-map-3d-town-overlay/town-animation-shaders.js";
import { createLazyConstructionPresentation } from "../client-map-3d-construction/client-map-3d-construction-presentation.js";
import { CONSTRUCTION_PHASES, type ConstructionSite } from "../client-construction-phase/client-construction-phase.js";
import { DISTRICT_BASE_LIFT, isDistrictProject, type DistrictVisualKind } from "./district-catalog.js";
import { createDistrictGeometry, DISTRICT_LAYERS, type DistrictGeometry } from "./district-geometry.js";
import { createDistrictMaterials } from "./district-materials.js";

type Placement = {
  readonly x: number; readonly y: number; readonly z: number; readonly kind?: DistrictVisualKind; readonly scale?: number;
  readonly operational: boolean; readonly foundation: boolean; readonly site?: ConstructionSite;
};
type Slot = { readonly meshes: readonly InstancedMesh[]; readonly geometry: DistrictGeometry; readonly states: InstancedBufferAttribute; readonly capacity: number };

export type DistrictOverlay = {
  readonly add: (placement: Placement) => void;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly boundaryPassed: () => boolean;
  readonly dispose: () => void;
  readonly diagnostics: { instances: number; overflow: number; slots: number };
};

export const createDistrictOverlay = (scene: Scene, maxTiles: number, envMap?: Texture, qualityTier = 0): DistrictOverlay => {
  const materials = createDistrictMaterials(envMap);
  const presentation = createLazyConstructionPresentation(scene, envMap);
  // At most two foundation variants per finite catalogue kind. Placements are
  // capped globally, rather than allocating maxTiles for every model up front.
  const slots = new Map<string, Slot>();
  const pending = new Map<string, Placement[]>();
  const diagnostics = { instances: 0, overflow: 0, slots: 0 };
  const matrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3(1, 1, 1);
  const release = (slot: Slot): void => {
    for (const mesh of slot.meshes) { scene.remove(mesh); mesh.dispose(); }
    for (const geometry of Object.values(slot.geometry.layers)) geometry.dispose();
  };
  const slotFor = (key: string, placements: readonly Placement[]): Slot => {
    const current = slots.get(key);
    if (current && current.capacity >= placements.length) return current;
    if (current) release(current);
    const first = placements[0];
    if (!first) throw new Error("District slot requires a placement");
    const capacity = Math.min(maxTiles, 2 ** Math.ceil(Math.log2(Math.max(1, placements.length))));
    const geometry = createDistrictGeometry(first.kind, first.foundation);
    const states = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    const meshes: InstancedMesh[] = [];
    for (const layer of DISTRICT_LAYERS) {
      if (qualityTier > 0 && (layer === "halo" || layer === "steam")) continue;
      const geo = geometry.layers[layer];
      if (!geo) continue;
      geo.setAttribute("districtState", states);
      const shield = first.kind === "AEGIS_DOME" && layer === "glass";
      const material = shield ? materials.shieldGlass : isDistrictProject(first.kind) && layer === "metal" ? materials.monumentMetal : materials.layers[layer];
      const mesh = new InstancedMesh(geo, material, capacity);
      mesh.name = `town-district-${key}-${layer}`;
      mesh.frustumCulled = false;
      mesh.castShadow = !shield && (layer === "body" || layer === "metal" || layer === "glass" || layer === "plinth");
      mesh.receiveShadow = mesh.castShadow;
      mesh.customDepthMaterial = materials.depth;
      mesh.onBeforeRender = tickTownTime;
      mesh.count = 0;
      meshes.push(mesh);
      scene.add(mesh);
    }
    const slot = { meshes, geometry, states, capacity };
    slots.set(key, slot);
    diagnostics.slots = slots.size;
    return slot;
  };
  return {
    diagnostics,
    add: placement => {
      if (diagnostics.instances >= maxTiles) { diagnostics.overflow += 1; return; }
      const key = `${placement.kind}-${placement.foundation ? "slab" : "town"}`;
      const entries = pending.get(key) ?? [];
      entries.push(placement);
      pending.set(key, entries);
      diagnostics.instances += 1;
    },
    clear: () => {
      pending.clear();
      diagnostics.instances = 0;
      for (const slot of slots.values()) for (const mesh of slot.meshes) mesh.count = 0;
      presentation.clear();
    },
    commit: () => {
      for (const [key, placements] of pending) {
        const slot = slotFor(key, placements);
        for (const [index, placement] of placements.entries()) {
          const { site } = placement;
          const cut = site ? slot.geometry.height * site.visibleBands / CONSTRUCTION_PHASES : 1000;
          slot.states.setXY(index, placement.operational && !site ? 1 : 0, cut);
          position.set(placement.x, placement.y + DISTRICT_BASE_LIFT, placement.z);
          scale.setScalar(placement.scale ?? 1);
          matrix.compose(position, rotation, scale);
          for (const mesh of slot.meshes) mesh.setMatrixAt(index, matrix);
          if (site) presentation.addSite(placement.x, placement.z, placement.y, site, slot.geometry.height * (placement.scale ?? 1));
        }
        slot.states.needsUpdate = true;
        for (const mesh of slot.meshes) { mesh.count = placements.length; mesh.instanceMatrix.needsUpdate = true; }
      }
      presentation.commit();
    },
    boundaryPassed: presentation.boundaryPassed,
    update: nowMs => presentation.update(nowMs),
    dispose: () => { presentation.dispose(); for (const slot of slots.values()) release(slot); slots.clear(); pending.clear(); materials.dispose(); }
  };
};
