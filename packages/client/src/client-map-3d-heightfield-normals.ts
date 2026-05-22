// Heightfield normal accumulator. Same algorithm as
// BufferGeometry.computeVertexNormals (face cross-product accumulated per
// vertex, then normalized) but operates on the typed arrays directly —
// the three.js path's BufferAttribute.fromBufferAttribute calls were the
// dominant per-frame cost during camera pan.

export const accumulateHeightfieldNormals = (
  positions: Float32Array,
  indices: Uint32Array,
  indexCount: number,
  normals: Float32Array,
  vertexCount: number
): void => {
  normals.fill(0);
  for (let f = 0; f < indexCount; f += 3) {
    const ia = indices[f]!;
    const ib = indices[f + 1]!;
    const ic = indices[f + 2]!;
    const a3 = ia * 3;
    const b3 = ib * 3;
    const c3 = ic * 3;
    const ax = positions[a3]!;
    const ay = positions[a3 + 1]!;
    const az = positions[a3 + 2]!;
    const ux = positions[b3]! - ax;
    const uy = positions[b3 + 1]! - ay;
    const uz = positions[b3 + 2]! - az;
    const vx = positions[c3]! - ax;
    const vy = positions[c3 + 1]! - ay;
    const vz = positions[c3 + 2]! - az;
    const fnx = uy * vz - uz * vy;
    const fny = uz * vx - ux * vz;
    const fnz = ux * vy - uy * vx;
    normals[a3] = normals[a3]! + fnx;
    normals[a3 + 1] = normals[a3 + 1]! + fny;
    normals[a3 + 2] = normals[a3 + 2]! + fnz;
    normals[b3] = normals[b3]! + fnx;
    normals[b3 + 1] = normals[b3 + 1]! + fny;
    normals[b3 + 2] = normals[b3 + 2]! + fnz;
    normals[c3] = normals[c3]! + fnx;
    normals[c3 + 1] = normals[c3 + 1]! + fny;
    normals[c3 + 2] = normals[c3 + 2]! + fnz;
  }
  for (let v = 0; v < vertexCount; v += 1) {
    const o = v * 3;
    const nx = normals[o]!;
    const ny = normals[o + 1]!;
    const nz = normals[o + 2]!;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      const inv = 1 / len;
      normals[o] = nx * inv;
      normals[o + 1] = ny * inv;
      normals[o + 2] = nz * inv;
    } else {
      normals[o] = 0;
      normals[o + 1] = 1;
      normals[o + 2] = 0;
    }
  }
};
