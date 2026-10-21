// Every hill dome (client-map-3d-hills.ts) is its own (subdiv+1)² vertex
// grid, and its normals come only from its own triangles. Two hill tiles
// joined by a plateau ridge (client-map-3d-hill-shape.ts) meet at full
// height, so those one-sided normals would light their shared edge as a
// visible crease. This averages the normals of coincident edge vertices so
// a hill massif shades as one continuous surface.
//
// An edge vertex no other dome shares borders ordinary ground instead. The
// plateau eases to that edge with zero slope, but the vertex's
// triangle-accumulated normal still leans up the first slope inside the
// dome, which drew a hard dark line around every hill where it met the
// (flat-lit) ground. Those vertices take the ground's up normal.
//
// Vertices are matched on their position snapped to the dome grid
// (1/subdiv of a tile): both domes place a shared-edge vertex at exactly
// the same grid step, while float positions computed from different tile
// origins can differ in the last bit.
export const smoothSharedHillEdgeNormals = (
  positions: Float32Array,
  normals: Float32Array,
  vertCount: number,
  subdiv: number
): void => {
  const rowStride = subdiv + 1;
  const vertsPerTile = rowStride * rowStride;
  // Local to one rebuild: at most the edge vertices of the visible domes.
  const groups = new Map<string, number[]>();
  for (let vi = 0; vi < vertCount; vi += 1) {
    const local = vi % vertsPerTile;
    const a = local % rowStride;
    const b = Math.floor(local / rowStride);
    if (a !== 0 && a !== subdiv && b !== 0 && b !== subdiv) continue;
    const key = `${Math.round(positions[vi * 3]! * subdiv)},${Math.round(positions[vi * 3 + 2]! * subdiv)}`;
    const group = groups.get(key);
    if (group) group.push(vi);
    else groups.set(key, [vi]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) {
      const vi = group[0]!;
      normals[vi * 3] = 0;
      normals[vi * 3 + 1] = 1;
      normals[vi * 3 + 2] = 0;
      continue;
    }
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (const vi of group) {
      nx += normals[vi * 3]!;
      ny += normals[vi * 3 + 1]!;
      nz += normals[vi * 3 + 2]!;
    }
    const len = Math.hypot(nx, ny, nz) || 1;
    for (const vi of group) {
      normals[vi * 3] = nx / len;
      normals[vi * 3 + 1] = ny / len;
      normals[vi * 3 + 2] = nz / len;
    }
  }
};
