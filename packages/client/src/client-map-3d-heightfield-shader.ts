import type { Texture, WebGLProgramParametersWithUniforms } from "three";
import { SNOW_MASK_GLSL } from "./client-map-3d-snow-mask.js";
import {
  TERRAIN_BUMP_NORMAL_GLSL,
  TERRAIN_NOISE_GLSL,
  TERRAIN_SURFACE_LAYERS_GLSL,
  TERRAIN_SURFACE_NOISE_GLSL,
  TERRAIN_WET_ROUGHNESS_GLSL
} from "./client-map-3d-terrain-surface-glsl.js";

// The main heightfield material's onBeforeCompile patch, split out from
// client-map-3d-heightfield.ts (which was already over the 500-line cap) so
// that file stays focused on geometry/mesh building. This is the single
// place the shared terrain material's fragment/vertex shaders are patched —
// client-map-3d-hills.ts's dome mesh reuses the exact same material
// instance, so every attribute referenced here (forestZone, tundraZone,
// rockZone) must exist on any geometry drawn with it, hill dome included.
export const applyHeightfieldMaterialShaderPatch = (
  sandColorMap: Texture,
  tundraColorMap: Texture
): ((shader: WebGLProgramParametersWithUniforms) => void) => {
  const sandMapUniform = { value: sandColorMap };
  const tundraMapUniform = { value: tundraColorMap };
  return (shader): void => {
    shader.uniforms.sandColorMap = sandMapUniform;
    shader.uniforms.tundraColorMap = tundraMapUniform;

    // Vertex shader: pass the raw world-coord uv (= camX + tileOffsetX + i,
    // see rebuild()) through as `vTerrainWorldUv` so the fragment shader can
    // recover which world tile a pixel belongs to via floor(). Also pass
    // forestZone (corner-averaged forest proximity) for the dark-grass halo
    // around tree tiles, tundraZone for the explicit tundra mask, and
    // rockZone for the explicit bare-rock mask (always 0 on the main grid;
    // only client-map-3d-hills.ts's dome mesh writes it, at its peaks).
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
attribute float forestZone;
attribute float tundraZone;
attribute float rockZone;
varying vec2 vTerrainWorldUv;
varying float vTerrainWorldY;
varying float vForestZone;
varying float vTundraZone;
varying float vRockZone;`
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
vTerrainWorldUv = uv;
vForestZone = forestZone;
vTundraZone = tundraZone;
vRockZone = rockZone;`
    );
    // World-space height for the wet-shoreline band (client-map-3d-terrain-surface-glsl.ts).
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
vTerrainWorldY = (modelMatrix * vec4(transformed, 1.0)).y;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform sampler2D sandColorMap;
uniform sampler2D tundraColorMap;
varying vec2 vTerrainWorldUv;
varying float vTerrainWorldY;
varying float vForestZone;
varying float vTundraZone;
varying float vRockZone;
${TERRAIN_NOISE_GLSL}`
    );
    // Replace three.js's built-in <map_fragment> with a biome-aware
    // texture blend. Each painted biome texture is read twice in continuous
    // world space and the two reads are noise-blended
    // (terrainSampleBiome), which hides the 8-tile repeat without anything
    // keyed to individual tiles -- see client-map-3d-terrain-surface-glsl.ts.
    // Soft-narrow biome cut keeps the grass/sand boundary anti-aliased
    // without the mid-blend zone that read as a darker green band before.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
    float terrainWetMask = 0.0;
    float terrainBumpHeight = 0.0;
    float terrainBumpStrength = 1.0;
    #ifdef USE_MAP
${TERRAIN_SURFACE_NOISE_GLSL}
      vec3 grassSample = terrainSampleBiome( map, vTerrainWorldUv, terrainLayerMask );
      vec3 sandSample = terrainSampleBiomeEven( sandColorMap, vTerrainWorldUv, terrainLayerMask );
      vec3 tundraSample = terrainSampleBiome( tundraColorMap, vTerrainWorldUv, terrainLayerMask );
      float greenBias = vColor.g - 0.5 * (vColor.r + vColor.b);
      // Feathered biome cut: the grass/sand threshold is pushed around by
      // the grass texture's own light/dark detail and by world noise
      // (terrainBiomeEdgeOffset), so sand shows through the gaps between
      // grass clumps for a soft, organic shoreline edge. A plain wide
      // smoothstep instead averaged the two textures into a muddy
      // green-into-tan band. TUNDRA's pale palette sits too close to
      // SAND's in this color-inferred space to tell apart the same way, so
      // it uses an explicit per-vertex mask (vTundraZone) instead, blended
      // in on top last.
      float grassMask = smoothstep(0.07, 0.13, greenBias + terrainBiomeEdgeOffset(grassSample, terrainMeso, terrainGrain));
      vec3 biomeColor = mix(sandSample, grassSample, grassMask);
      // Feathered like the grass/sand cut (terrainBiomeEdgeOffset) so the
      // tundra edge wanders organically instead of tracing a corner blob.
      float tundraMask = smoothstep(0.34, 0.66, vTundraZone + terrainTundraEdgeOffset(terrainMeso, terrainGrain));
      biomeColor = mix(biomeColor, tundraSample, tundraMask);
      // SNOW: same tundraZone as TUNDRA, told apart only by its near-white
      // vertex colour -- see client-map-3d-snow-mask.ts.
      float vertLum = max(0.001, dot(vColor.rgb, vec3(0.299, 0.587, 0.114)));
${SNOW_MASK_GLSL}

      // Bare-rock peaks (client-map-3d-hills.ts's dome mesh only): an
      // explicit mask rather than inferring from vertex colour, same
      // reasoning as tundraMask — a hill peak's colour is still the
      // biome's own hue (grass/sand/etc, bilinear-blended from real
      // neighbours) so greenBias-based inference would just pick that
      // biome's texture, never grey.
      float rockMask = smoothstep(0.28, 0.55, vRockZone);
      biomeColor = mix(biomeColor, vec3(0.56, 0.55, 0.52), rockMask);
${TERRAIN_SURFACE_LAYERS_GLSL}

      // Forest halo: where the grass is within 2 tiles of a tree tile
      // (vForestZone interpolates 0..1 from the per-corner average),
      // multiply down toward a forest-floor tone. Gated by grassMask so
      // sand near forests stays bright. Only ~30% darkening at full
      // strength so the speckled grass detail is still readable.
      float forestDarken = vForestZone * grassMask;
      vec3 forestTinted = biomeColor * mix(vec3(1.0), vec3(0.66, 0.78, 0.58), forestDarken);

      // Very mild vertex-color tint at 12% — beach-corner blends and
      // per-tile shade variants still register; painted base dominates.
      vec3 tint = mix(vec3(1.0), vColor.rgb / vertLum, 0.12);
      diffuseColor.rgb = forestTinted * tint;
    #endif
    `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
${TERRAIN_WET_ROUGHNESS_GLSL}`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
${TERRAIN_BUMP_NORMAL_GLSL}`
    );

    // Brightness floor: lifts pure-black cliff walls (near-vertical faces
    // that receive almost no overhead directional light) to a dark sandy
    // tone. max() leaves well-lit grass/sand faces completely unchanged.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <output_fragment>",
      `#include <output_fragment>
gl_FragColor.rgb = max(gl_FragColor.rgb, vec3(0.10, 0.07, 0.03));`
    );
  };
};
