import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Scene,
  Vector3
} from "three";

export type TownTier = "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";

type Vec2 = readonly [number, number];

type TierConfig = {
  readonly houseCount: number;
  readonly towers: ReadonlyArray<Vec2>;
  readonly spire: boolean;
  // Max half-width of the hut cluster, so a settlement clusters tightly
  // around the tile centre while a metropolis spreads close to the tile
  // edges. Range ~0.0..0.46.
  readonly clusterRadius: number;
  // Per-instance hut scale, so a 100-hut metropolis has smaller huts than
  // a 3-hut settlement — keeps the visual readable as the population grows.
  readonly houseScale: number;
};

// Hut footprint is small so 100 of them fit cleanly on a 1×1 tile.
const HOUSE_BODY_WIDTH = 0.08;
const HOUSE_BODY_HEIGHT = 0.07;
const HOUSE_BODY_HALF_HEIGHT = HOUSE_BODY_HEIGHT * 0.5;
const HOUSE_ROOF_RADIUS = 0.062;
const HOUSE_ROOF_HEIGHT = 0.06;
const HOUSE_ROOF_CENTER_OFFSET = HOUSE_BODY_HEIGHT + HOUSE_ROOF_HEIGHT * 0.5;

const TOWER_HEIGHT = 0.55;
const TOWER_HALF_HEIGHT = TOWER_HEIGHT * 0.5;
const TOWER_CAP_HEIGHT = 0.18;
const TOWER_CAP_OFFSET = TOWER_HEIGHT + TOWER_CAP_HEIGHT * 0.5;

const SPIRE_BASE_HEIGHT = 0.34;
const SPIRE_TIP_HEIGHT = 0.78;
const SPIRE_BASE_HALF_HEIGHT = SPIRE_BASE_HEIGHT * 0.5;
const SPIRE_TIP_OFFSET = SPIRE_BASE_HEIGHT + SPIRE_TIP_HEIGHT * 0.5;

const TIER_CONFIG: Record<TownTier, TierConfig> = {
  SETTLEMENT: { houseCount: 3, towers: [], spire: false, clusterRadius: 0.10, houseScale: 1.0 },
  TOWN: { houseCount: 10, towers: [], spire: false, clusterRadius: 0.22, houseScale: 0.92 },
  CITY: { houseCount: 15, towers: [[0, 0]], spire: false, clusterRadius: 0.32, houseScale: 0.82 },
  GREAT_CITY: { houseCount: 20, towers: [[-0.24, 0], [0.24, 0]], spire: false, clusterRadius: 0.40, houseScale: 0.74 },
  METROPOLIS: { houseCount: 100, towers: [[-0.32, -0.30], [0.32, 0.28]], spire: true, clusterRadius: 0.46, houseScale: 0.55 }
};

// Maximum house instances across all visible towns at once.
// Heavy weight (12×) so a busy view full of mid-tier towns plus a couple of
// METROPOLIS tiles all fit without truncation; 14000 visible tiles × 12 =
// 168000 instance budget.
const HOUSE_INSTANCE_MULTIPLIER = 12;
const TOWER_INSTANCE_MULTIPLIER = 2;

// Deterministic 0..1 hash so the same town always paints the same hut layout.
const hash01 = (idx: number, salt: number): number => {
  const v = Math.sin(idx * 12.9898 + salt * 78.233) * 43758.5453;
  return v - Math.floor(v);
};

// Generate `count` hut positions inside the tile. Uses a square grid sized to
// hold the count, picked in nearest-to-centre order so low-count towns
// cluster centrally and high-count towns spread to the edges. Per-instance
// jitter avoids the dead grid look.
type HousePlacement = { readonly x: number; readonly z: number; readonly rotationY: number };

const generateHousePositions = (count: number, clusterRadius: number): ReadonlyArray<HousePlacement> => {
  if (count <= 0) return [];
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(count)));
  const span = clusterRadius * 2;
  const spacing = gridSize > 1 ? span / (gridSize - 1) : 0;
  const start = gridSize > 1 ? -clusterRadius : 0;

  const cells: Array<{ readonly cx: number; readonly cz: number; readonly d2: number }> = [];
  for (let j = 0; j < gridSize; j += 1) {
    for (let i = 0; i < gridSize; i += 1) {
      const cx = start + i * spacing;
      const cz = start + j * spacing;
      cells.push({ cx, cz, d2: cx * cx + cz * cz });
    }
  }
  cells.sort((a, b) => a.d2 - b.d2);

  const placements: HousePlacement[] = [];
  for (let i = 0; i < count && i < cells.length; i += 1) {
    const { cx, cz } = cells[i]!;
    const jitterScale = spacing * 0.32;
    const jx = (hash01(i, 1) - 0.5) * jitterScale;
    const jz = (hash01(i, 2) - 0.5) * jitterScale;
    const rotationY = hash01(i, 3) * Math.PI;
    placements.push({ x: cx + jx, z: cz + jz, rotationY });
  }
  return placements;
};

const HOUSE_PLACEMENTS_BY_TIER: Record<TownTier, ReadonlyArray<HousePlacement>> = {
  SETTLEMENT: generateHousePositions(TIER_CONFIG.SETTLEMENT.houseCount, TIER_CONFIG.SETTLEMENT.clusterRadius),
  TOWN: generateHousePositions(TIER_CONFIG.TOWN.houseCount, TIER_CONFIG.TOWN.clusterRadius),
  CITY: generateHousePositions(TIER_CONFIG.CITY.houseCount, TIER_CONFIG.CITY.clusterRadius),
  GREAT_CITY: generateHousePositions(TIER_CONFIG.GREAT_CITY.houseCount, TIER_CONFIG.GREAT_CITY.clusterRadius),
  METROPOLIS: generateHousePositions(TIER_CONFIG.METROPOLIS.houseCount, TIER_CONFIG.METROPOLIS.clusterRadius)
};

export type TownOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (centerX: number, centerZ: number, surfaceY: number, tier: TownTier) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

export const createTownOverlay = (scene: Scene, maxTiles: number): TownOverlay => {
  const group = new Group();
  group.name = "town-overlay";
  scene.add(group);

  const houseBodyGeometry = new BoxGeometry(HOUSE_BODY_WIDTH, HOUSE_BODY_HEIGHT, HOUSE_BODY_WIDTH);
  const houseRoofGeometry = new ConeGeometry(HOUSE_ROOF_RADIUS, HOUSE_ROOF_HEIGHT, 4, 1);
  houseRoofGeometry.rotateY(Math.PI / 4);
  const towerBodyGeometry = new CylinderGeometry(0.085, 0.10, TOWER_HEIGHT, 8, 1, false);
  const towerCapGeometry = new ConeGeometry(0.115, TOWER_CAP_HEIGHT, 8, 1);
  const spireBaseGeometry = new BoxGeometry(0.18, SPIRE_BASE_HEIGHT, 0.18);
  const spireTipGeometry = new ConeGeometry(0.10, SPIRE_TIP_HEIGHT, 8, 1);

  const houseBodyMaterial = new MeshStandardMaterial({ color: "#c9b48b", roughness: 0.86, metalness: 0, flatShading: true });
  const houseRoofMaterial = new MeshStandardMaterial({ color: "#a04a3a", roughness: 0.78, metalness: 0, flatShading: true });
  const towerBodyMaterial = new MeshStandardMaterial({ color: "#8a8377", roughness: 0.84, metalness: 0, flatShading: true });
  const towerCapMaterial = new MeshStandardMaterial({ color: "#534b40", roughness: 0.78, metalness: 0, flatShading: true });
  const spireBaseMaterial = new MeshStandardMaterial({ color: "#dcd4bf", roughness: 0.66, metalness: 0.18, flatShading: true });
  const spireTipMaterial = new MeshStandardMaterial({ color: "#d4af37", roughness: 0.34, metalness: 0.78, flatShading: true });

  const houseMax = maxTiles * HOUSE_INSTANCE_MULTIPLIER;
  const towerMax = maxTiles * TOWER_INSTANCE_MULTIPLIER;
  const spireMax = maxTiles;

  const houseBodyMesh = new InstancedMesh(houseBodyGeometry, houseBodyMaterial, houseMax);
  const houseRoofMesh = new InstancedMesh(houseRoofGeometry, houseRoofMaterial, houseMax);
  const towerBodyMesh = new InstancedMesh(towerBodyGeometry, towerBodyMaterial, towerMax);
  const towerCapMesh = new InstancedMesh(towerCapGeometry, towerCapMaterial, towerMax);
  const spireBaseMesh = new InstancedMesh(spireBaseGeometry, spireBaseMaterial, spireMax);
  const spireTipMesh = new InstancedMesh(spireTipGeometry, spireTipMaterial, spireMax);

  for (const mesh of [houseBodyMesh, houseRoofMesh, towerBodyMesh, towerCapMesh, spireBaseMesh, spireTipMesh]) {
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  group.add(houseBodyMesh, houseRoofMesh, towerBodyMesh, towerCapMesh, spireBaseMesh, spireTipMesh);

  const tempMatrix = new Matrix4();
  const rotationMatrix = new Matrix4();
  const tempScale = new Vector3();
  let houseCount = 0;
  let towerCount = 0;
  let spireCount = 0;

  const clear = (): void => {
    houseCount = 0;
    towerCount = 0;
    spireCount = 0;
  };

  const addInstance = (
    centerX: number,
    centerZ: number,
    surfaceY: number,
    tier: TownTier
  ): void => {
    const cfg = TIER_CONFIG[tier];
    const placements = HOUSE_PLACEMENTS_BY_TIER[tier];
    const s = cfg.houseScale;
    const bodyHalf = HOUSE_BODY_HALF_HEIGHT * s;
    const roofMid = HOUSE_ROOF_CENTER_OFFSET * s;

    for (const placement of placements) {
      if (houseCount >= houseMax) break;
      rotationMatrix.makeRotationY(placement.rotationY);
      // Scale the whole hut by tier (smaller huts when there are more of them).
      tempScale.set(s, s, s);
      rotationMatrix.scale(tempScale);
      tempMatrix.copy(rotationMatrix);
      tempMatrix.setPosition(centerX + placement.x, surfaceY + bodyHalf, centerZ + placement.z);
      houseBodyMesh.setMatrixAt(houseCount, tempMatrix);
      tempMatrix.copy(rotationMatrix);
      tempMatrix.setPosition(centerX + placement.x, surfaceY + roofMid, centerZ + placement.z);
      houseRoofMesh.setMatrixAt(houseCount, tempMatrix);
      houseCount += 1;
    }

    for (const [ox, oz] of cfg.towers) {
      if (towerCount >= towerMax) break;
      tempMatrix.makeTranslation(centerX + ox, surfaceY + TOWER_HALF_HEIGHT, centerZ + oz);
      towerBodyMesh.setMatrixAt(towerCount, tempMatrix);
      tempMatrix.makeTranslation(centerX + ox, surfaceY + TOWER_CAP_OFFSET, centerZ + oz);
      towerCapMesh.setMatrixAt(towerCount, tempMatrix);
      towerCount += 1;
    }

    if (cfg.spire && spireCount < spireMax) {
      tempMatrix.makeTranslation(centerX, surfaceY + SPIRE_BASE_HALF_HEIGHT, centerZ);
      spireBaseMesh.setMatrixAt(spireCount, tempMatrix);
      tempMatrix.makeTranslation(centerX, surfaceY + SPIRE_TIP_OFFSET, centerZ);
      spireTipMesh.setMatrixAt(spireCount, tempMatrix);
      spireCount += 1;
    }
  };

  const commit = (): void => {
    houseBodyMesh.count = houseCount;
    houseRoofMesh.count = houseCount;
    towerBodyMesh.count = towerCount;
    towerCapMesh.count = towerCount;
    spireBaseMesh.count = spireCount;
    spireTipMesh.count = spireCount;
    houseBodyMesh.instanceMatrix.needsUpdate = true;
    houseRoofMesh.instanceMatrix.needsUpdate = true;
    towerBodyMesh.instanceMatrix.needsUpdate = true;
    towerCapMesh.instanceMatrix.needsUpdate = true;
    spireBaseMesh.instanceMatrix.needsUpdate = true;
    spireTipMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    scene.remove(group);
    houseBodyGeometry.dispose();
    houseRoofGeometry.dispose();
    towerBodyGeometry.dispose();
    towerCapGeometry.dispose();
    spireBaseGeometry.dispose();
    spireTipGeometry.dispose();
    houseBodyMaterial.dispose();
    houseRoofMaterial.dispose();
    towerBodyMaterial.dispose();
    towerCapMaterial.dispose();
    spireBaseMaterial.dispose();
    spireTipMaterial.dispose();
  };

  return { group, clear, addInstance, commit, dispose };
};
