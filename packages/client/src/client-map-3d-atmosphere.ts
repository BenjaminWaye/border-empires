import {
  BackSide,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3
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
  // Resizes the sun's shadow-camera frustum to cover the currently built
  // terrain window (see client-map-3d.ts's maybeRebuild) -- called only on a
  // rebuild, not every frame, since the frustum only needs to change when the
  // visible tile radius does.
  readonly updateShadowFrame: (halfExtentTiles: number) => void;
  // Recenters the shadow frustum under wherever the camera is actually
  // looking right now. Called from applyCamera() (already dirty-checked, so
  // this stays cheap) so the shadow stays aligned with the live pan between
  // rebuilds instead of snapping only when sceneOrigin re-anchors.
  readonly updateShadowTarget: (sceneX: number, sceneZ: number) => void;
  readonly dispose: () => void;
};

// Extra margin beyond the exact visible-tile radius so a tree/structure right
// at the window's edge doesn't poke outside the shadow frustum and pop
// in/out of shadow as it nears the boundary.
const SHADOW_FRAME_MARGIN_TILES = 4;
// Hard cap on the shadow frustum's half-extent regardless of how far zoomed
// out the camera is. The shadow map is a fixed SHADOW_MAP_SIZE texel grid --
// letting the frustum grow to the full visible-tile radius at max zoom-out
// (which can be 50+ tiles) spreads those texels thin enough that a texel
// covers more world space than a tree trunk or a building wall, which reads
// as pervasive shadow acne (fine-detail surfaces flickering between lit and
// self-shadowed) rather than a clean shadow. Capping means shadows silently
// stop rendering past this radius when heavily zoomed out -- an acceptable
// trade against every visible structure/tree looking speckled at that zoom.
const SHADOW_FRAME_MAX_HALF_EXTENT_TILES = 36;
// Distance from the shadow camera to its target along the sun's fixed
// direction -- must clear every caster (heightfield hills + the tallest
// structure) on the near side and the ground on the far side. Not tied to
// SHADOW_FRAME_MARGIN_TILES: this is depth along the light's own axis, not
// the frustum's width/height.
const SHADOW_CAMERA_NEAR = 1;
const SHADOW_CAMERA_FAR = 200;

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
  // On top of the fixed tilt noted above, the camera also never orbits --
  // camera.position.x/z only drift a few tiles for pan, no rotate control
  // exists. At the reference zoom it sits at roughly (0.5, 21, 15) looking at
  // (0.5, 0, 0.5), i.e. above and toward +Z, down toward -Z. Since the
  // azimuth is fixed, a static light aligned with it gets the "lit from
  // behind the viewer" effect a free-orbit game would need a camera-tracking
  // light for, at zero runtime cost.
  //
  // A first attempt just rotated the OLD position's azimuth toward +Z while
  // keeping its y=75: (45,75,25) -> (6,75,46). That barely changed anything
  // visible -- both positions sit ~32-34 deg off vertical (near-overhead),
  // so only the light's horizontal COMPASS DIRECTION rotated, not how
  // raking/grazing it is. An overhead-ish light mostly lights roofs
  // (normal.y-dominant) regardless of azimuth, so vertical wall faces
  // (normal.x/z-dominant -- what "which side is shadowed" actually means)
  // barely changed. Confirmed by a direct side-by-side: looked identical.
  //
  // This position instead lowers the elevation substantially (~55 deg off
  // vertical, i.e. ~35 deg above the horizon -- notably more raking than
  // before) while keeping the same +Z-dominant azimuth (matching the
  // camera's own side), so it now visibly differentiates camera-facing
  // (+Z-normal) walls from far-side (-Z-normal) walls instead of mostly
  // just tinting roofs.
  const SUN_OFFSET = new Vector3(8, 42, 60);
  sun.position.copy(SUN_OFFSET);
  const fillLight = new DirectionalLight("#ff8a5c", 0.55);
  fillLight.position.set(-30, 20, -40);

  // Only the sun casts -- the fill/hemi lights are unlit-shadow fakes (no
  // `.shadow` cost) that exist purely to keep the far side of a structure
  // from reading as pure black; a second real shadow pass from fillLight
  // would double the shadow-map render cost for a shadow the sun's own
  // already covers from the opposite side.
  sun.castShadow = true;
  // 2048 (bumped from 1024): at 1024, texel density over a several-dozen-tile
  // frustum was coarse enough relative to trunk/wall-scale geometry to read as
  // acne -- surfaces flickering self-shadowed instead of just reflecting the
  // sun/hemi/fill light like they should, which is what made buildings still
  // look dark/unlit even with castShadow/receiveShadow on. Paired with the
  // frustum's own hard cap below, this is the main fix.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = SHADOW_CAMERA_NEAR;
  sun.shadow.camera.far = SHADOW_CAMERA_FAR;
  // Small negative bias trims shadow acne (the surface self-shadowing its own
  // texels from depth-map quantization) without letting the shadow visibly
  // detach from its caster ("peter-panning") the way a larger bias would.
  sun.shadow.bias = -0.0015;
  // Bumped from 0.02 -- normalBias offsets the shadow lookup along the
  // surface normal (not the light direction), which is the more targeted fix
  // for acne on near-grazing-angle faces than a larger depth bias would be.
  // Complements, doesn't replace, the higher map resolution above.
  sun.shadow.normalBias = 0.05;
  // Softens how dark the shadowed side actually goes (1 = fully unlit by the
  // sun, only hemi/fill remain; three.js r160+ shadow.intensity). Requested
  // directly ("make the shadow a bit lighter") -- a fully-dark shadow also
  // fought the ownership-tint overlay's multiply blend below by making owned
  // tiles' shadowed patches read as near-black instead of a visibly-tinted
  // darker patch.
  sun.shadow.intensity = 0.6;
  scene.add(sun.target);

  // Orthographic shadow-camera frustum: square, centered on sun.target, sized
  // to the visible tile radius plus margin. Only called on a rebuild (see
  // AtmosphereResources' doc comment above), so recomputing the projection
  // matrix here is not a per-frame cost.
  const updateShadowFrame = (halfExtentTiles: number): void => {
    const half = Math.min(halfExtentTiles + SHADOW_FRAME_MARGIN_TILES, SHADOW_FRAME_MAX_HALF_EXTENT_TILES);
    const cam = sun.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    cam.updateProjectionMatrix();
  };
  // Keeps the light rigidly offset from its target along SUN_OFFSET's
  // direction so the frustum recenters without changing the sun's angle.
  const updateShadowTarget = (sceneX: number, sceneZ: number): void => {
    sun.target.position.set(sceneX, 0, sceneZ);
    sun.position.set(sceneX + SUN_OFFSET.x, SUN_OFFSET.y, sceneZ + SUN_OFFSET.z);
  };
  updateShadowFrame(0);

  scene.add(skyMesh, hemiLight, sun, fillLight);

  const dispose = (): void => {
    scene.remove(skyMesh, hemiLight, sun, sun.target, fillLight);
    skyGeometry.dispose();
    skyMaterial.dispose();
    sun.shadow.dispose();
    scene.fog = null;
  };

  return { skyMesh, skyGeometry, skyMaterial, hemiLight, sun, fillLight, updateShadowFrame, updateShadowTarget, dispose };
};
