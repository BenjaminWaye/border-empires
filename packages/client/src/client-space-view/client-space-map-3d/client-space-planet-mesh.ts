// Planet mesh factory: a lit sphere body plus a fresnel-rim "glow" shell,
// with per-state (owned/contested/other/frontier) color and animation
// tuning. Kept as pure factories (no scene/camera coupling) so
// client-space-scene.ts just assembles+animates what this returns.
import {
  AdditiveBlending,
  BackSide,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry
} from "three";
import type { SpacePlanetState, Vec3 } from "../client-space-view-state.js";

export type PlanetMeshEntry = {
  seasonId: string;
  state: SpacePlanetState;
  group: Group;
  body: Mesh;
  glow: Mesh;
  ring: Mesh | undefined;
  // Base scale/spin rate, used by the animation loop for subtle rotation and
  // the contested pulse — kept on the entry rather than recomputed per frame.
  spinSpeed: number;
};

const STATE_COLOR: Record<SpacePlanetState, number> = {
  owned: 0x38bdf8, // bright cyan — matches the existing gx-orb highlight color
  contested: 0xf97316, // warning orange — the "being fought over" ring/pulse
  other: 0x64748b, // dim neutral
  frontier: 0x334155 // very dim marker, per design doc §41
};

const STATE_RADIUS: Record<SpacePlanetState, number> = {
  owned: 1.6,
  contested: 1.3,
  other: 1.1,
  frontier: 0.6
};

const FRESNEL_VERTEX_SHADER = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRESNEL_FRAGMENT_SHADER = `
  uniform vec3 glowColor;
  uniform float intensity;
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  void main() {
    float rim = 1.0 - max(dot(normalize(vNormal), normalize(vViewPosition)), 0.0);
    float alpha = pow(rim, 2.2) * intensity;
    gl_FragColor = vec4(glowColor, alpha);
  }
`;

const createGlowMaterial = (color: number, intensity: number): ShaderMaterial =>
  new ShaderMaterial({
    uniforms: {
      glowColor: { value: new Color(color) },
      intensity: { value: intensity }
    },
    vertexShader: FRESNEL_VERTEX_SHADER,
    fragmentShader: FRESNEL_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: BackSide
  });

/**
 * Builds one planet's full visual: body sphere + fresnel glow shell, plus a
 * warning ring for contested worlds. Position is applied by the caller
 * (see `galaxyLayoutPosition`) — this factory only builds geometry local to
 * the planet's own group origin.
 */
export const createPlanetMesh = (seasonId: string, state: SpacePlanetState, position: Vec3): PlanetMeshEntry => {
  const color = STATE_COLOR[state];
  const radius = STATE_RADIUS[state];

  const group = new Group();
  group.position.set(position.x, position.y, position.z);
  group.userData.seasonId = seasonId;

  const bodyGeometry = new SphereGeometry(radius, 32, 32);
  const bodyMaterial = new MeshStandardMaterial({
    color,
    emissive: new Color(color).multiplyScalar(state === "frontier" ? 0.05 : 0.25),
    roughness: 0.55,
    metalness: 0.15
  });
  const body = new Mesh(bodyGeometry, bodyMaterial);
  body.userData.seasonId = seasonId;
  group.add(body);

  const glowGeometry = new SphereGeometry(radius * 1.35, 32, 32);
  const glowIntensity = state === "owned" ? 1.6 : state === "contested" ? 1.4 : state === "other" ? 0.7 : 0.3;
  const glow = new Mesh(glowGeometry, createGlowMaterial(color, glowIntensity));
  group.add(glow);

  let ring: Mesh | undefined;
  if (state === "contested") {
    const ringGeometry = new RingGeometry(radius * 1.7, radius * 1.95, 48);
    const ringMaterial = new ShaderMaterial({
      uniforms: { glowColor: { value: new Color(color) }, intensity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 glowColor; uniform float intensity; varying vec2 vUv; void main(){ gl_FragColor = vec4(glowColor, intensity); }`,
      transparent: true,
      side: BackSide,
      depthWrite: false,
      blending: AdditiveBlending
    });
    ring = new Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  return {
    seasonId,
    state,
    group,
    body,
    glow,
    ring,
    spinSpeed: state === "owned" ? 0.12 : state === "contested" ? 0.2 : 0.05
  };
};

/** Disposes every geometry/material this factory allocated for one entry. */
export const disposePlanetMesh = (entry: PlanetMeshEntry): void => {
  entry.body.geometry.dispose();
  (entry.body.material as MeshStandardMaterial).dispose();
  entry.glow.geometry.dispose();
  (entry.glow.material as ShaderMaterial).dispose();
  if (entry.ring) {
    entry.ring.geometry.dispose();
    (entry.ring.material as ShaderMaterial).dispose();
  }
};

/**
 * Per-frame animation for one planet: gentle self-rotation for all states,
 * plus a pulsing ring opacity and glow scale for contested worlds (the
 * "being fought over" warning cue).
 */
export const animatePlanetMesh = (entry: PlanetMeshEntry, elapsedSeconds: number): void => {
  entry.body.rotation.y += entry.spinSpeed * 0.016;
  entry.glow.rotation.y = entry.body.rotation.y;
  const ring = entry.ring;
  if (ring && entry.state === "contested") {
    const pulse = 0.5 + 0.5 * Math.sin(elapsedSeconds * 3.2);
    const intensityUniform = (ring.material as ShaderMaterial).uniforms.intensity;
    if (intensityUniform) intensityUniform.value = 0.4 + pulse * 0.6;
    const scale = 1 + pulse * 0.08;
    ring.scale.set(scale, scale, scale);
  }
};
