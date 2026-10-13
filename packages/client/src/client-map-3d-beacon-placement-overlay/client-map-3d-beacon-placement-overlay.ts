import { AdditiveBlending, DoubleSide, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, RingGeometry, type Scene } from "three";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";
import { computeOutpostReachPreview } from "../client-reach-overlay-beacon-preview/client-reach-overlay-beacon-preview.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import { relayBeaconPlacementSites, RELAY_BEACON_RECOMMENDED_SITE_COUNT } from "../client-relay-beacon-site/client-relay-beacon-placement-sites.js";
import type { PlacementOverlaySyncDeps } from "../client-map-3d-placement-overlay/client-map-3d-placement-overlay.js";

// True-3D counterpart to client-placement-preview-2d.ts's Relay Beacon
// preview: while a Relay Beacon is being placed, tint the ground the beacon
// would *newly* bring into reach (blue, same as the 2D ghost) and ring the
// recommended spots (green, same ring as the onboarding checklist's
// objective marker). The range ring itself is drawn by the shared
// placement-range marker in client-map-3d-placement-overlay.ts.

const NEW_REACH_RISE_ABOVE_HEIGHTFIELD = 0.013;
const SITE_RISE_ABOVE_HEIGHTFIELD = 0.016;
// OUTPOST reach radius 5 -> an 11x11 disk at most.
const MAX_NEW_REACH_TILES = 11 * 11;

export type BeaconPlacementOverlay = {
  readonly sync: (deps: PlacementOverlaySyncDeps) => void;
  readonly hide: () => void;
};

export const createBeaconPlacementOverlay = (scene: Scene): BeaconPlacementOverlay => {
  const reachGeometry = new PlaneGeometry(0.92, 0.92);
  reachGeometry.rotateX(-Math.PI * 0.5);
  const reachMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#96dcff", transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: DoubleSide });
  const reachFill = new InstancedMesh(reachGeometry, reachMaterial, MAX_NEW_REACH_TILES);
  reachFill.instanceMatrix.setUsage(DynamicDrawUsage);
  reachFill.frustumCulled = false;
  reachFill.renderOrder = 13;
  reachFill.count = 0;
  reachFill.visible = false;

  const siteGeometry = new RingGeometry(0.58, 0.7, 28);
  siteGeometry.rotateX(-Math.PI * 0.5);
  const siteMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#7ee08a", transparent: true, opacity: 0.85, blending: AdditiveBlending, depthTest: false, depthWrite: false });
  const siteRings = new InstancedMesh(siteGeometry, siteMaterial, RELAY_BEACON_RECOMMENDED_SITE_COUNT);
  siteRings.instanceMatrix.setUsage(DynamicDrawUsage);
  siteRings.frustumCulled = false;
  siteRings.renderOrder = 16;
  siteRings.count = 0;
  siteRings.visible = false;

  scene.add(reachFill, siteRings);
  const matrix = new Matrix4();

  const surfaceYAt = (deps: PlacementOverlaySyncDeps, wx: number, wy: number): number => {
    const wxNext = wx + 1 >= WORLD_WIDTH ? 0 : wx + 1;
    const wyNext = wy + 1 >= WORLD_HEIGHT ? 0 : wy + 1;
    return (deps.cornerYAt(wx, wy) + deps.cornerYAt(wxNext, wy) + deps.cornerYAt(wx, wyNext) + deps.cornerYAt(wxNext, wyNext)) / 4;
  };

  const placeAt = (mesh: InstancedMesh, index: number, deps: PlacementOverlaySyncDeps, wx: number, wy: number, rise: number, scale = 1): void => {
    const localX = toroidDelta(deps.sceneOrigin.camX, wx, WORLD_WIDTH) + 0.5;
    const localZ = toroidDelta(deps.sceneOrigin.camY, wy, WORLD_HEIGHT) + 0.5;
    matrix.makeScale(scale, 1, scale);
    matrix.setPosition(localX, surfaceYAt(deps, wx, wy) + rise, localZ);
    mesh.setMatrixAt(index, matrix);
  };

  const commit = (mesh: InstancedMesh, count: number): void => {
    mesh.count = count;
    mesh.visible = count > 0;
    if (count === 0) return;
    mesh.instanceMatrix.clearUpdateRanges();
    mesh.instanceMatrix.addUpdateRange(0, count * 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const syncRecommendedSites = (deps: PlacementOverlaySyncDeps): void => {
    const sites = relayBeaconPlacementSites(deps.state);
    sites.forEach((site, index) => placeAt(siteRings, index, deps, site.x, site.y, SITE_RISE_ABOVE_HEIGHTFIELD, index === 0 ? 1.12 : 0.92));
    commit(siteRings, sites.length);
  };

  const syncNewReach = (deps: PlacementOverlaySyncDeps): void => {
    const { x, y } = deps.state.buildingPlacement;
    if (deps.tileVisibilityStateAt(x, y, deps.state.tiles.get(deps.keyFor(x, y))) !== "visible") {
      commit(reachFill, 0);
      return;
    }
    const reach = resolveMyReachCached(deps.state);
    let count = 0;
    for (const key of computeOutpostReachPreview(x, y)) {
      if (count >= MAX_NEW_REACH_TILES) break;
      if (reach.has(key)) continue; // already in reach -- nothing new to show
      const [kx, ky] = key.split(",").map(Number);
      if (!Number.isFinite(kx) || !Number.isFinite(ky)) continue;
      placeAt(reachFill, count, deps, kx!, ky!, NEW_REACH_RISE_ABOVE_HEIGHTFIELD);
      count += 1;
    }
    commit(reachFill, count);
  };

  const hide = (): void => {
    commit(reachFill, 0);
    commit(siteRings, 0);
  };

  const sync = (deps: PlacementOverlaySyncDeps): void => {
    if (!deps.state.buildingPlacement.active || deps.state.buildingPlacement.structureType !== "RELAY_BEACON") {
      hide();
      return;
    }
    syncRecommendedSites(deps);
    syncNewReach(deps);
  };

  return { sync, hide };
};
