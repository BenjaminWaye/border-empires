import type { Texture, WebGLProgramParametersWithUniforms } from "three";

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

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
uniform sampler2D sandColorMap;
uniform sampler2D tundraColorMap;
varying vec2 vTerrainWorldUv;
varying float vForestZone;
varying float vTundraZone;
varying float vRockZone;`
    );
    // Replace three.js's built-in <map_fragment> with a biome-aware
    // two-texture blend that also adds per-tile variation. The painted
    // grass/sand textures tile every 8 world units, but each individual
    // world tile hashes its coord into a 90° rotation + random offset so it
    // samples a different region of the texture — the eye stops noticing
    // repetition. Soft-narrow biome cut keeps the grass/sand boundary
    // anti-aliased without the mid-blend zone that read as a darker green
    // band before.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
    #ifdef USE_MAP
      // ---- Per-tile UV variation ----
      vec2 tileId = floor(vTerrainWorldUv);
      float h1 = fract(sin(dot(tileId, vec2(12.9898, 78.233))) * 43758.5453);
      float h2 = fract(sin(dot(tileId, vec2(63.7264, 10.873))) * 43758.5453);
      float angle = floor(h1 * 4.0) * 1.5707963267948966;
      float ca = cos(angle);
      float sa = sin(angle);
      mat2 R = mat2(ca, -sa, sa, ca);
      vec2 inTile = vTerrainWorldUv - tileId;
      vec2 rotated = R * (inTile - 0.5) + 0.5;
      vec2 offset = vec2(h2 * 8.0, fract(h2 * 7.31) * 8.0);
      // Multiply by 1/tilesPerRepeat (8) to put back into texture-local UV;
      // the texture has RepeatWrapping so any value samples cleanly.
      vec2 sampleUv = (tileId + rotated + offset) * 0.125;

      vec4 grassSample = texture2D( map, sampleUv );
      vec4 sandSample = texture2D( sandColorMap, sampleUv );
      vec4 tundraSample = texture2D( tundraColorMap, sampleUv );
      float greenBias = vColor.g - 0.5 * (vColor.r + vColor.b);
      // Soft-narrow biome cut: 0.03-wide blend zone, just enough to
      // antialias the seam without a visible mid-blend band of
      // muddy-green-into-tan. TUNDRA's pale palette sits too close to
      // SAND's in this color-inferred space to tell apart the same way, so
      // it uses an explicit per-vertex mask (vTundraZone) instead, blended
      // in on top last.
      float grassMask = smoothstep(0.055, 0.085, greenBias);
      vec3 biomeColor = mix(sandSample.rgb, grassSample.rgb, grassMask);
      float tundraMask = smoothstep(0.4, 0.6, vTundraZone);
      biomeColor = mix(biomeColor, tundraSample.rgb, tundraMask);

      // Bare-rock peaks (client-map-3d-hills.ts's dome mesh only): an
      // explicit mask rather than inferring from vertex colour, same
      // reasoning as tundraMask — a hill peak's colour is still the
      // biome's own hue (grass/sand/etc, bilinear-blended from real
      // neighbours) so greenBias-based inference would just pick that
      // biome's texture, never grey.
      float rockMask = smoothstep(0.28, 0.55, vRockZone);
      biomeColor = mix(biomeColor, vec3(0.56, 0.55, 0.52), rockMask);

      // Forest halo: where the grass is within 2 tiles of a tree tile
      // (vForestZone interpolates 0..1 from the per-corner average),
      // multiply down toward a forest-floor tone. Gated by grassMask so
      // sand near forests stays bright. Only ~30% darkening at full
      // strength so the speckled grass detail is still readable.
      float forestDarken = vForestZone * grassMask;
      vec3 forestTinted = biomeColor * mix(vec3(1.0), vec3(0.66, 0.78, 0.58), forestDarken);

      // Very mild vertex-color tint at 12% — beach-corner blends and
      // per-tile shade variants still register; painted base dominates.
      float vertLum = max(0.001, dot(vColor.rgb, vec3(0.299, 0.587, 0.114)));
      vec3 tint = mix(vec3(1.0), vColor.rgb / vertLum, 0.12);
      diffuseColor.rgb = forestTinted * tint;
    #endif
    `
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
