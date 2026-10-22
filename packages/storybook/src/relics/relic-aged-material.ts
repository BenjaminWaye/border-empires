import { DoubleSide, MeshStandardMaterial } from "three";

/** Object-space wear stays fixed when instanced or viewed from another angle. */
export const createRelicAgedMaterial = (color: string, metalness: number): MeshStandardMaterial => {
  const material = new MeshStandardMaterial({
    color, metalness, roughness: 0.98, flatShading: true, vertexColors: true, side: DoubleSide
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `varying vec3 vRelicPosition;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRelicPosition = position;");
    shader.fragmentShader = `
      varying vec3 vRelicPosition;
      float relicHash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      float relicNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(relicHash(i), relicHash(i + vec3(1,0,0)), f.x),
              mix(relicHash(i + vec3(0,1,0)), relicHash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(relicHash(i + vec3(0,0,1)), relicHash(i + vec3(1,0,1)), f.x),
              mix(relicHash(i + vec3(0,1,1)), relicHash(i + vec3(1,1,1)), f.x), f.y), f.z);
      }
      ${shader.fragmentShader}
    `.replace("#include <color_fragment>", `
      #include <color_fragment>
      float stain = relicNoise(vRelicPosition * 13.0);
      float pits = relicNoise(vRelicPosition * 105.0);
      diffuseColor.rgb *= mix(0.54, 1.16, stain) * mix(0.73, 1.08, pits);
      float moss = smoothstep(0.52, 0.72, relicNoise(vRelicPosition * 8.0 + 19.0));
      moss *= 1.0 - smoothstep(0.05, 0.85, vRelicPosition.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.16, 0.07), moss * 0.65);
      float crack = abs(sin(vRelicPosition.x * 13.0 + sin(vRelicPosition.z * 20.0) * 0.3));
      crack = (1.0 - smoothstep(0.015, 0.045, crack)) * smoothstep(0.50, 0.65, stain);
      diffuseColor.rgb *= 1.0 - crack * 0.65;
    `);
  };
  material.customProgramCacheKey = () => "relic-aged-cladding-v1";
  return material;
};
