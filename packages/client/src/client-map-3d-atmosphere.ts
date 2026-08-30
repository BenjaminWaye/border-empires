import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry
} from "three";

// These are black on purpose, and only one of them is ever drawn.
//
// Note the sky shader's naming is misleading: `midColor` is the color *at* the
// horizon line, `topColor` is the zenith, and `horizonColor` is what's drawn
// *below* the horizon — the void the world sits in.
//
// The map camera has a fixed tilt (PERSPECTIVE_TILT_RADIANS = 0.6) and a 45°
// FOV, which puts its topmost ray ~33° below horizontal. Every visible sky
// fragment therefore has h <= -0.546, past the end of the shader's
// smoothstep(0.0, -0.5, h) — so the whole screen resolves to `horizonColor`
// and `midColor`/`topColor` never render at all.
//
// Consequence: giving these a daylight gradient does nothing except repaint
// the entire unexplored void, which is what reads as fog-of-war in the
// current art direction. Changing them is a camera change, not a color one.
export const SKY_TOP_COLOR = "#000000";
export const SKY_MID_COLOR = "#000000";
export const SKY_HORIZON_COLOR = "#000000";
export const FOG_COLOR = "#000000";
export const FOG_DENSITY = 0.0042;
export const SKY_RADIUS = 1800;

const SKY_VERTEX_SHADER = `
varying vec3 vWorldPosition;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPosition = wp.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT_SHADER = `
varying vec3 vWorldPosition;
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 horizonColor;
void main() {
  float h = normalize(vWorldPosition).y;
  vec3 c = h > 0.0
    ? mix(midColor, topColor, smoothstep(0.0, 0.7, h))
    : mix(midColor, horizonColor, smoothstep(0.0, -0.5, h));
  gl_FragColor = vec4(c, 1.0);
}
`;

export type AtmosphereResources = {
  readonly skyMesh: Mesh;
  readonly skyGeometry: SphereGeometry;
  readonly skyMaterial: ShaderMaterial;
  readonly hemiLight: HemisphereLight;
  readonly sun: DirectionalLight;
  readonly fillLight: DirectionalLight;
  readonly dispose: () => void;
};

export const createAtmosphere = (scene: Scene): AtmosphereResources => {
  scene.background = new Color(FOG_COLOR);
  scene.fog = new FogExp2(FOG_COLOR, FOG_DENSITY);

  const skyGeometry = new SphereGeometry(SKY_RADIUS, 32, 16);
  const skyMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new Color(SKY_TOP_COLOR) },
      midColor: { value: new Color(SKY_MID_COLOR) },
      horizonColor: { value: new Color(SKY_HORIZON_COLOR) }
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER
  });
  const skyMesh = new Mesh(skyGeometry, skyMaterial);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;

  // hemiLight and fillLight are what light the side of a structure that
  // isn't facing the sun — which, for a single fixed-direction key light,
  // is most of what the camera actually sees on any given building. The 3D
  // overlays (dozens of them now) are all authored and eyeballed in
  // Storybook, whose stage lighting runs far brighter than this (its
  // default is an 0.55 ambient + 0.9 sun with no tone mapping at all, and
  // several overlays' own "studio" rigs stack a 2+ intensity key light on
  // top of that). Tuned against that, then dropped into these dimmer,
  // more contrasty numbers, every overlay's shadow-facing surfaces sank
  // toward the same near-black regardless of their actual palette — which
  // is why buildings stopped reading as visually distinct in game even
  // though they're clearly different in their Storybook previews. Raising
  // hemi/fill (and leaving the sun alone) keeps the key light's direction
  // and mood intact while giving those surfaces enough light to actually
  // show their color again.
  const hemiLight = new HemisphereLight("#b8c8ff", "#2a2030", 0.7);
  const sun = new DirectionalLight("#fff0c0", 1.55);
  // The map camera has a FIXED azimuth -- no orbit/rotate control anywhere
  // (client-map-3d-perspective-camera.ts's PERSPECTIVE_TILT_RADIANS is a
  // constant, and camera.position.x/z only ever drift by a few tiles for
  // pan, never rotate around the scene). At the reference zoom the camera
  // sits at roughly (0.5, 21, 15) looking at (0.5, 0, 0.5) -- i.e. above and
  // toward +Z, looking down toward -Z. A DirectionalLight with a strong
  // sideways bias (previously x=45, ~3x the camera's own z-offset and with
  // no matching x-offset at all) doesn't shine from anywhere near the
  // camera's own direction, so the faces of buildings/terrain the camera
  // actually sees (their +Z-facing sides) stayed in shadow regardless of
  // where the player looked -- since the camera's azimuth never changes,
  // this doesn't need to track the camera at runtime the way it would in a
  // free-orbit game; a fixed light aligned with the fixed camera achieves
  // the same "always lit from behind the viewer" effect with no added cost.
  // Small x offset (not 0) keeps some cross-lighting so faces don't go flat.
  sun.position.set(6, 75, 46);
  const fillLight = new DirectionalLight("#ff8a5c", 0.55);
  fillLight.position.set(-30, 20, -40);

  scene.add(skyMesh, hemiLight, sun, fillLight);

  const dispose = (): void => {
    scene.remove(skyMesh, hemiLight, sun, fillLight);
    skyGeometry.dispose();
    skyMaterial.dispose();
    scene.fog = null;
  };

  return { skyMesh, skyGeometry, skyMaterial, hemiLight, sun, fillLight, dispose };
};
