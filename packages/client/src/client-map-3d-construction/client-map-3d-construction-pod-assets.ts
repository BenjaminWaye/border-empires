import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  IcosahedronGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  Scene,
  SubtractiveBlending,
  type BufferGeometry,
  type Material
} from "three";
import { POD_BODY_HEIGHT } from "./client-map-3d-construction-pod-flight.js";

// Meshes for the construction parts deliveries (client-map-3d-construction-pod-fx.ts): the pod
// and the courier drone that carries it. Every part of every delivery is an instance of one of
// these InstancedMeshes, so the whole effect costs the same handful of draw calls whether one
// delivery is under way or twenty-four are. Glows and rings are additive, so an instance's colour
// doubles as its opacity (black is invisible); the ground shadow is subtractive for the same reason.

// The pod is the shipping container for one phase's crate stack: it encloses the stack
// (client-map-3d-construction-crew.ts: four 0.075 crates in a 0.16 square, two high) and opens
// around it on landing.
export const POD_HALF = 0.095;
// The flight maths hangs the pod from its lid, so the height is defined there.
export const POD_HEIGHT = POD_BODY_HEIGHT;
const POST = 0.022;
const PLATE = 0.016;
export const POD_PANEL = { width: 0.15, height: POD_HEIGHT - 2 * PLATE, thickness: 0.012 } as const;

export type PodMeshKey = "frame" | "panel" | "beacon" | "drone" | "duct" | "line" | "puff" | "glow" | "ring" | "shadow" | "dust";

// Scene names of the pod meshes, for tests and debugging.
export const podMeshName = (key: PodMeshKey): string => `construction-pod-${key}`;

export type PodFxAssets = {
  readonly meshes: Readonly<Record<PodMeshKey, InstancedMesh>>;
  readonly dispose: () => void;
};

// The courier drone (drone-local, hull centre at the origin, nose toward +Z): a steel hull on four
// brass arms, each ending in a ducted fan.
export const DRONE_ROTORS = 4;
export const DRONE_ROTOR_REACH = 0.17; // arm length along each diagonal axis
export const DRONE_DUCT_RADIUS = 0.075;
export const DRONE_HULL = { width: 0.15, height: 0.05, length: 0.2 } as const;

// Per-delivery instance budgets, per mesh.
export const POD_FRAME_PARTS = 6; // pod: base, lid, four corner posts
const DRONE_FRAME_PARTS = DRONE_ROTORS + 2; // drone: four arms, the dorsal spine, the winch hook
export const POD_PANELS = 4;
export const DRONE_BLADES_PER_ROTOR = 2;
const DRONE_PARTS = 1 + DRONE_ROTORS * (1 + DRONE_BLADES_PER_ROTOR); // hull, and per rotor its hub and blades
export const POD_PUFFS = 4; // chamber flare, belly light, two nav lights
export const POD_GLOWS = DRONE_ROTORS + 3; // rotor blur discs, the crown's glow, the landing light, touchdown
export const POD_RINGS = 2; // print scan ring, touchdown ring
export const POD_SHADOWS = 2; // drone, pod
export const POD_DUST = 14;

// Soft round sprite, white so instance colours tint it.
const makeSoftDiscTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
};

const glowMaterial = (map: CanvasTexture | null): MeshBasicMaterial =>
  new MeshBasicMaterial({ toneMapped: false, map, color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false });

export const createPodFxAssets = (scene: Scene, maxPods: number): PodFxAssets => {
  const softDisc = makeSoftDiscTexture();

  const frameGeometry = new BoxGeometry(1, 1, 1); // scaled per part: base and lid plates, corner posts
  const panelGeometry = new BoxGeometry(POD_PANEL.width, POD_PANEL.height, POD_PANEL.thickness);
  panelGeometry.translate(0, POD_PANEL.height / 2, 0); // hinged at its bottom edge
  const beaconGeometry = new BoxGeometry(0.026, 0.016, 0.026);
  const droneGeometry = new BoxGeometry(1, 1, 1); // scaled per part: hull, rotor hubs, blades
  const ductGeometry = new CylinderGeometry(DRONE_DUCT_RADIUS, DRONE_DUCT_RADIUS * 0.88, 0.034, 18, 1, true);
  // Unit-length line hanging from its top: scale.y is the line's length.
  const lineGeometry = new CylinderGeometry(0.0045, 0.0045, 1, 5, 1, true);
  lineGeometry.translate(0, -0.5, 0);
  const puffGeometry = new IcosahedronGeometry(1, 0);
  const glowGeometry = new PlaneGeometry(1, 1);
  glowGeometry.rotateX(-Math.PI / 2);
  const ringGeometry = new RingGeometry(0.9, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);
  const shadowGeometry = new PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const dustGeometry = new IcosahedronGeometry(1, 0);

  // Aged brass frame (the AFC's own joint metal) around steel walls carrying the crates' cyan
  // glow: the pod reads as AFC-made, and as the box the crates came in.
  const frameMaterial = new MeshStandardMaterial({ color: "#a8844a", roughness: 0.4, metalness: 0.75, flatShading: true });
  const panelMaterial = new MeshStandardMaterial({ color: "#46505c", emissive: "#4fd8ff", emissiveIntensity: 0.4, roughness: 0.5, metalness: 0.55, flatShading: true });
  const beaconMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#bdf6ff" });
  // The drone's hull and blades: blackened steel like the AFC's own body.
  const droneMaterial = new MeshStandardMaterial({ color: "#2a3038", roughness: 0.45, metalness: 0.7, flatShading: true });
  const ductMaterial = new MeshStandardMaterial({ color: "#a8844a", roughness: 0.4, metalness: 0.75, side: DoubleSide });
  const lineMaterial = new MeshStandardMaterial({ color: "#1c2026", roughness: 0.8, metalness: 0.3 });
  const puffMaterial = new MeshBasicMaterial({ toneMapped: false, color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false });
  const ringMaterial = glowMaterial(null);
  const glowDiscMaterial = glowMaterial(softDisc);
  // dst * (1 - src): a soft dark disc whose strength is its instance colour.
  const shadowMaterial = new MeshBasicMaterial({ toneMapped: false, map: softDisc, color: "#ffffff", transparent: true, blending: SubtractiveBlending, premultipliedAlpha: true, depthWrite: false });
  const dustMaterial = new MeshStandardMaterial({ color: "#a39886", roughness: 1, metalness: 0, flatShading: true, transparent: true, opacity: 0.85, blending: NormalBlending, depthWrite: false });

  const black = new Color(0, 0, 0);
  const make = (key: PodMeshKey, geometry: BufferGeometry, material: Material, perPod: number, tinted: boolean, order: number): InstancedMesh => {
    const mesh = new InstancedMesh(geometry, material, maxPods * perPod);
    mesh.name = podMeshName(key);
    mesh.frustumCulled = false; // instances span the whole flight; the bounds would be the whole map anyway
    mesh.count = 0;
    mesh.visible = false;
    mesh.renderOrder = order;
    // Allocate the colour buffer before the first render so the shader is compiled with it.
    if (tinted) for (let i = 0; i < mesh.instanceMatrix.count; i += 1) mesh.setColorAt(i, black);
    scene.add(mesh);
    return mesh;
  };

  const meshes: Record<PodMeshKey, InstancedMesh> = {
    panel: make("panel", panelGeometry, panelMaterial, POD_PANELS, false, 0),
    beacon: make("beacon", beaconGeometry, beaconMaterial, 1, false, 0),
    drone: make("drone", droneGeometry, droneMaterial, DRONE_PARTS, false, 0),
    duct: make("duct", ductGeometry, ductMaterial, DRONE_ROTORS, false, 0),
    line: make("line", lineGeometry, lineMaterial, 1, false, 0),
    frame: make("frame", frameGeometry, frameMaterial, POD_FRAME_PARTS + DRONE_FRAME_PARTS, false, 0),
    dust: make("dust", dustGeometry, dustMaterial, POD_DUST, false, 1),
    shadow: make("shadow", shadowGeometry, shadowMaterial, POD_SHADOWS, true, 2),
    glow: make("glow", glowGeometry, glowDiscMaterial, POD_GLOWS, true, 3),
    ring: make("ring", ringGeometry, ringMaterial, POD_RINGS, true, 3),
    puff: make("puff", puffGeometry, puffMaterial, POD_PUFFS, true, 4)
  };

  const dispose = (): void => {
    for (const mesh of Object.values(meshes)) {
      scene.remove(mesh);
      mesh.dispose();
      mesh.geometry.dispose();
      (mesh.material as Material).dispose();
    }
    softDisc?.dispose();
  };

  return { meshes, dispose };
};

// Frame part layout in pod-local space (bottom centre at the origin): [x, y, z, sx, sy, sz].
export const POD_FRAME_LAYOUT: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [0, PLATE / 2, 0, 2 * POD_HALF, PLATE, 2 * POD_HALF], // base plate
  [0, POD_HEIGHT - PLATE / 2, 0, 2 * POD_HALF, PLATE, 2 * POD_HALF], // lid
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [sx! * (POD_HALF - POST / 2), POD_HEIGHT / 2, sz! * (POD_HALF - POST / 2), POST, POD_HEIGHT - 2 * PLATE, POST] as const)
];
export const POD_PLATE = PLATE;
export const POD_POST = POST;
