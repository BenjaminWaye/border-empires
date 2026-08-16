import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry
} from "three";

// Part table for the mustering tower: the same full steampunk-tower model
// that used to mark a single waypoint now marks every mustering tile at
// once (there can be several simultaneously — "mustering on five border
// tiles at once" is an explicit play pattern), so it's built as one
// InstancedMesh per part rather than one Group of raw meshes per tile.
// client-map-3d-muster-overlay.ts drives these specs: it owns the entry
// list, sets each InstancedMesh's per-frame matrices from `local()`, and
// tints the `tinted` parts per-instance via instanceColor.
const BRASS_HI = "#d2a76a";
const BRASS_LO = "#8b6f47";
const COPPER = "#a85d36";

export type TowerAnim = {
  readonly hexSpin: number;
  readonly glowSpin: number;
  readonly medallionSpin: number;
  readonly faceSpin: number;
  readonly sway: number;
  readonly smokeWave: number;
};

// t is seconds, already offset by a per-tile phase hash so towers across
// the map don't bob/spin in lockstep.
export const computeTowerAnim = (t: number): TowerAnim => ({
  hexSpin: Math.PI / 8 + t * 0.15,
  glowSpin: -t * 0.25,
  medallionSpin: t * 0.35,
  faceSpin: -t * 0.5,
  sway: Math.sin(t * 2.0) * 0.12,
  smokeWave: (Math.sin(t * 1.1) + 1) * 0.5
});

export type TowerLocal = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

export type TowerPartSpec = {
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
  // Sub-instances per tile: 2 for mirrored left/right parts, else 1.
  readonly subCount: 1 | 2;
  // Tinted parts render white and get their color from per-instance
  // instanceColor (the tile's owner color, brightened for ADVANCE mode).
  readonly tinted: boolean;
  readonly renderOrder: number;
  readonly local: (sub: number, anim: TowerAnim) => TowerLocal;
};

const mat = (color: string, opacity: number, doubleSide = false): MeshBasicMaterial =>
  new MeshBasicMaterial({
    toneMapped: false, color, transparent: true, opacity, depthTest: false, depthWrite: false,
    ...(doubleSide ? { side: DoubleSide } : {})
  });

const fixed = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): TowerLocal => ({ x, y, z, rx, ry, rz });

export const buildTowerPartSpecs = (): TowerPartSpec[] => [
  {
    geometry: new TorusGeometry(0.55, 0.04, 4, 8),
    material: mat("#ffffff", 0.7),
    subCount: 1,
    tinted: true,
    renderOrder: 30,
    local: (_sub, anim) => fixed(0, 0.01, 0, Math.PI / 2, 0, anim.hexSpin)
  },
  {
    geometry: new CylinderGeometry(0.42, 0.46, 0.16, 8),
    material: mat(BRASS_LO, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 31,
    local: () => fixed(0, 0.1, 0)
  },
  {
    geometry: new TorusGeometry(0.28, 0.03, 4, 16),
    material: mat("#ffffff", 0.8),
    subCount: 1,
    tinted: true,
    renderOrder: 31,
    local: (_sub, anim) => fixed(0, 0.19, 0, Math.PI / 2, 0, anim.glowSpin)
  },
  {
    geometry: new CylinderGeometry(0.04, 0.05, 0.32, 10),
    material: mat(COPPER, 0.98),
    subCount: 2,
    tinted: false,
    renderOrder: 31,
    local: (sub) => fixed(sub === 0 ? -0.4 : 0.4, 0.24, 0, 0, 0, Math.PI / 2)
  },
  {
    geometry: new PlaneGeometry(0.12, 0.5),
    material: mat("#ffffff", 0.12, true),
    subCount: 2,
    tinted: true,
    renderOrder: 30,
    local: (sub, anim) => fixed(
      sub === 0 ? -0.28 : 0.28,
      0.5 + anim.smokeWave * 0.18 + (sub === 0 ? 0 : 0.06),
      0
    )
  },
  {
    geometry: new CylinderGeometry(0.075, 0.1, 1.1, 12),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 32,
    local: () => fixed(0, 0.75, 0)
  },
  {
    geometry: new CylinderGeometry(0.105, 0.105, 0.04, 12),
    material: mat(COPPER, 0.95),
    subCount: 1,
    tinted: false,
    renderOrder: 32,
    local: () => fixed(0, 0.4, 0)
  },
  {
    geometry: new CylinderGeometry(0.085, 0.085, 0.04, 12),
    material: mat(COPPER, 0.95),
    subCount: 1,
    tinted: false,
    renderOrder: 32,
    local: () => fixed(0, 1.05, 0)
  },
  {
    geometry: new CylinderGeometry(0.025, 0.025, 0.5, 8),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 32,
    local: () => fixed(0, 0.7, 0, 0, 0, Math.PI / 2)
  },
  {
    geometry: new SphereGeometry(0.04, 8, 6),
    material: mat(BRASS_HI, 0.98),
    subCount: 2,
    tinted: false,
    renderOrder: 32,
    local: (sub) => fixed(sub === 0 ? -0.25 : 0.25, 0.7, 0)
  },
  {
    geometry: new PlaneGeometry(0.42, 0.7),
    material: mat(COPPER, 0.95, true),
    subCount: 1,
    tinted: false,
    renderOrder: 32,
    local: (_sub, anim) => fixed(0, 0.36, -0.005, 0, anim.sway, 0)
  },
  {
    geometry: new PlaneGeometry(0.36, 0.62),
    material: mat("#ffffff", 0.97, true),
    subCount: 1,
    tinted: true,
    renderOrder: 33,
    local: (_sub, anim) => fixed(0, 0.38, 0, 0, anim.sway, 0)
  },
  {
    geometry: new CylinderGeometry(0.1, 0.1, 0.005, 16),
    material: mat(BRASS_LO, 0.95),
    subCount: 1,
    tinted: false,
    renderOrder: 34,
    local: (_sub, anim) => fixed(0, 0.4, 0.01, Math.PI / 2, anim.sway, 0)
  },
  {
    geometry: new TorusGeometry(0.1, 0.012, 6, 16),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 35,
    local: (_sub, anim) => fixed(0, 0.4, 0.015, 0, anim.sway, 0)
  },
  {
    geometry: new TorusGeometry(0.22, 0.025, 8, 24),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 34,
    local: (_sub, anim) => fixed(0, 1.35, 0, 0, 0, anim.medallionSpin)
  },
  {
    geometry: new CylinderGeometry(0.2, 0.2, 0.025, 18),
    material: mat("#ffffff", 0.9),
    subCount: 1,
    tinted: true,
    renderOrder: 33,
    local: (_sub, anim) => fixed(0, 1.35, 0, Math.PI / 2, 0, anim.faceSpin)
  },
  {
    geometry: new ConeGeometry(0.06, 0.3, 5),
    material: mat(BRASS_HI, 0.95),
    subCount: 2,
    tinted: false,
    renderOrder: 33,
    local: (sub) => fixed(sub === 0 ? -0.36 : 0.36, 1.35, 0, 0, 0, sub === 0 ? Math.PI / 2 : -Math.PI / 2)
  },
  {
    geometry: new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 34,
    local: () => fixed(0, 1.5, 0)
  },
  {
    geometry: new ConeGeometry(0.025, 0.22, 8),
    material: mat(BRASS_HI, 0.98),
    subCount: 1,
    tinted: false,
    renderOrder: 35,
    local: () => fixed(0, 1.72, 0)
  }
];
