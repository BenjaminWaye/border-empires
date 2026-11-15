// Exact integer hash for value-noise lattice corners, shared by every 3D
// shader that runs value noise over a lattice (the unexplored storm, roads,
// the beach band, natural wonders, incursion breaches, marble, relics).
//
// Why integers: the usual fract(sin(dot(p, k)) * 43758.5) hash -- and the
// fract(p * vec2(123.34, 456.21)) cascade -- amplify float rounding by orders
// of magnitude. Value noise computes each lattice corner from both cells that
// share it, and some mobile GPU compilers round dot(i + 1, k) differently from
// the neighbouring cell's dot(i, k): the two cells then disagree on the shared
// corner and the noise jumps at every cell edge, drawing blocky cell-sized
// rectangles. Unsigned-integer bit mixing is exact, so every device gives a
// corner one value however the compiler rearranges the float maths.
//
// three.js >= r163 is WebGL2-only, so every ShaderMaterial / onBeforeCompile
// shader is GLSL ES 3.00 and has uint. The variables are highp because the
// fragment language's default int precision is mediump, which may be 16-bit.
//
// Pass a lattice point: floor()ed, so exact in float and in int range. The
// guard lets two snippets that both carry this helper share one shader.

export const LATTICE_HASH_GLSL = `
#ifndef BE_LATTICE_HASH
#define BE_LATTICE_HASH
highp uint latticeHashMix(highp uint h) {
  h ^= h >> 16u;
  h *= 0x7feb352du;
  h ^= h >> 15u;
  h *= 0x846ca68bu;
  h ^= h >> 16u;
  return h;
}
float latticeHashToUnit(highp uint h) { return float(h >> 8u) * (1.0 / 16777216.0); }
// 0..1 for an integer lattice point.
float latticeHash2(vec2 p) {
  highp uvec2 q = uvec2(ivec2(p));
  return latticeHashToUnit(latticeHashMix(q.x * 1597334677u ^ q.y * 3812015801u));
}
float latticeHash3(vec3 p) {
  highp uvec3 q = uvec3(ivec3(p));
  return latticeHashToUnit(latticeHashMix(q.x * 1597334677u ^ q.y * 3812015801u ^ q.z * 2798796415u));
}
#endif
`;
