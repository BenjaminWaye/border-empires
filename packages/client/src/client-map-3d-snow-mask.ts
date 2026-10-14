// SNOW tiles reuse the TUNDRA texture path in the 3D terrain shader
// (tundraZone covers both), and the only thing telling them apart is their
// near-white vertex colour. The shader's general vertex tint divides the
// colour by its own luminance (hue only), so on its own that brightness is
// thrown away and snow drew identical to tundra. This mask recovers it:
// bright AND not yellow, so a tundra coast corner blended toward the warm
// beach colour (similar luminance, much yellower) never reads as snow.
//
// The GLSL in client-map-3d-heightfield-shader.ts is generated from these
// constants, and heightfieldSnowMask mirrors it so tests can pin which
// palette colours land on which side of the cut.
export const SNOW_MASK_LUM_LOW = 0.84;
export const SNOW_MASK_LUM_HIGH = 0.89;
export const SNOW_MASK_YELLOW_LOW = 0.03;
export const SNOW_MASK_YELLOW_HIGH = 0.08;
// Snow ground colour, mixed lightly with the tundra texture sample so the
// painted grain still shows through instead of a flat white sheet.
export const SNOW_GROUND_RGB: readonly [number, number, number] = [0.93, 0.95, 0.97];
export const SNOW_TEXTURE_DETAIL = 0.2;

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// r/g/b in 0..1, exactly as the shader sees vColor.
export const heightfieldSnowMask = (r: number, g: number, b: number): number => {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const yellowness = 0.5 * (r + g) - b;
  return smoothstep(SNOW_MASK_LUM_LOW, SNOW_MASK_LUM_HIGH, lum) * (1 - smoothstep(SNOW_MASK_YELLOW_LOW, SNOW_MASK_YELLOW_HIGH, yellowness));
};

const glslFloat = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Expects `vColor`, `vertLum`, `tundraMask`, `tundraSample` and `biomeColor`
// in scope; blends biomeColor toward snow where the vertex colour says SNOW.
export const SNOW_MASK_GLSL = `
      float snowYellow = 0.5 * (vColor.r + vColor.g) - vColor.b;
      float snowMask = tundraMask
        * smoothstep(${glslFloat(SNOW_MASK_LUM_LOW)}, ${glslFloat(SNOW_MASK_LUM_HIGH)}, vertLum)
        * (1.0 - smoothstep(${glslFloat(SNOW_MASK_YELLOW_LOW)}, ${glslFloat(SNOW_MASK_YELLOW_HIGH)}, snowYellow));
      vec3 snowColor = mix(vec3(${SNOW_GROUND_RGB.map(glslFloat).join(", ")}), tundraSample.rgb, ${glslFloat(SNOW_TEXTURE_DETAIL)});
      biomeColor = mix(biomeColor, snowColor, snowMask);`;
