import {
  AdditiveBlending, Group, Mesh, MeshBasicMaterial, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking,
  type Material, type Texture
} from "three";
import {
  createRoutedTownBuilder, createTownMeshBuilder, createTownRandom
} from "@client/client-map-3d-town-overlay/town-mesh-builder.js";
import {
  applyTownSpin, applyTownSteam, tickTownTime
} from "@client/client-map-3d-town-overlay/town-animation-shaders.js";
import { TOWN_PLINTH_LEDGES, type TownBuilders } from "@client/client-map-3d-town-overlay/town-parts.js";
import { applyMarbleFinish } from "@client/client-map-3d-muster-banner/muster-banner-marble-material.js";

// Storybook-only design studies. Reuse the actual town palette, baking kit,
// marble treatment and animation shaders so comparisons are meaningful.
export type ClusterMesh = { readonly group: Group; readonly dispose: () => void };

export const createClusterMesh = (
  draw: (builders: TownBuilders) => void,
  envMap: Texture,
  seed = 73
): ClusterMesh => {
  const matte = createTownMeshBuilder({ occlusion: true, weathering: 0.1 });
  const metal = createTownMeshBuilder({ occlusion: true });
  const glass = createTownMeshBuilder({ occlusion: true, sheen: 0.35 });
  const t: TownBuilders = {
    body: createRoutedTownBuilder(matte, metal, glass),
    glow: createTownMeshBuilder(), halo: createTownMeshBuilder(),
    steam: createTownMeshBuilder(), plinth: createTownMeshBuilder(),
    random: createTownRandom(seed)
  };
  draw(t);
  const solid = (roughness: number, metalness: number): MeshStandardMaterial =>
    new MeshStandardMaterial({ vertexColors: true, roughness, metalness, flatShading: true, envMap });
  const bodyMaterial = solid(0.82, 0.02);
  const metalMaterial = solid(0.45, 0.7);
  const glassMaterial = solid(0.2, 0.85);
  const glowMaterial = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const haloMaterial = new MeshBasicMaterial({
    vertexColors: true, toneMapped: false, transparent: true, opacity: 0.32,
    blending: AdditiveBlending, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4
  });
  const steamMaterial = new MeshStandardMaterial({
    vertexColors: true, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false
  });
  const plinthMaterial = solid(0.22, 0);
  applyMarbleFinish(plinthMaterial, TOWN_PLINTH_LEDGES);
  for (const material of [bodyMaterial, metalMaterial, glassMaterial]) applyTownSpin(material);
  applyTownSpin(glowMaterial, true);
  applyTownSpin(haloMaterial, true);
  applyTownSteam(steamMaterial);
  const depthMaterial = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  applyTownSpin(depthMaterial);
  const layers: ReadonlyArray<readonly [ReturnType<typeof createTownMeshBuilder>, Material]> = [
    [matte, bodyMaterial], [metal, metalMaterial], [glass, glassMaterial],
    [t.glow, glowMaterial], [t.halo, haloMaterial], [t.steam, steamMaterial], [t.plinth, plinthMaterial]
  ];
  const group = new Group();
  const meshes: Mesh[] = [];
  for (const [builder, material] of layers) {
    const geometry = builder.build();
    if (!geometry) continue;
    const mesh = new Mesh(geometry, material);
    // Animated parts can travel outside their baked, unanimated bounds.
    mesh.frustumCulled = false;
    mesh.onBeforeRender = tickTownTime;
    mesh.castShadow = material === bodyMaterial || material === metalMaterial || material === glassMaterial || material === plinthMaterial;
    mesh.receiveShadow = mesh.castShadow;
    mesh.customDepthMaterial = depthMaterial;
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    group,
    dispose: () => {
      group.removeFromParent();
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const [, material] of layers) material.dispose();
      depthMaterial.dispose();
    }
  };
};
