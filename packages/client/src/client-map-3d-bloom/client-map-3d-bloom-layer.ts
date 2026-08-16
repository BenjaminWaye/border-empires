// Bloom in this renderer uses the standard three.js *selective* technique
// (see webgl_postprocessing_unreal_bloom_selective in the three.js examples)
// rather than a naive whole-scene luminance threshold. A whole-scene
// threshold would also catch the map's plain-white UI markers — the
// selection ring, hover marker, crystal-targeting reticle, muster pennant —
// which are the exact same materials the tone-mapping sweep
// (client-map-3d-render-target.ts) had to protect with `toneMapped: false`
// for legibility. Blooming a selection ring as you hover tiles would read as
// a bug, not polish.
//
// The technique: objects that should glow opt in with
// `mesh.layers.enable(BLOOM_LAYER)`. Every *other* frame, before the
// bloom-source render, every object NOT on this layer has its material
// temporarily swapped to solid black (contributing zero luminance), so the
// bloom pass only ever sees what explicitly opted in — untagged objects
// can't accidentally bloom no matter how bright their literal color is.
// See client-map-3d-bloom-pipeline.ts for where that swap happens.
//
// Layer 0 (the three.js default every object starts on) is left alone, so
// tagging an object for bloom is additive — it stays visible in the normal
// pass and *also* contributes to the bloom pass.
export const BLOOM_LAYER = 1;
