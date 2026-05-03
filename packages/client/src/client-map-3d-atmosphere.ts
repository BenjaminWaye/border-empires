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

export const SKY_TOP_COLOR = "#0a1530";
export const SKY_MID_COLOR = "#223a66";
export const SKY_HORIZON_COLOR = "#4d3a52";
export const FOG_COLOR = "#1a3554";
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

  const hemiLight = new HemisphereLight("#b8c8ff", "#2a2030", 0.45);
  const sun = new DirectionalLight("#fff0c0", 1.55);
  sun.position.set(45, 75, 25);
  const fillLight = new DirectionalLight("#ff8a5c", 0.35);
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
