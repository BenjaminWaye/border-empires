import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Mesh,
  Scene,
  ShaderMaterial
} from "three";
import type { RoadDirections } from "../client-road-network/client-road-network.js";

type RoadDir = keyof Omit<RoadDirections, "terminal">;

export type RoadOverlay = {
  readonly group: Group;
  readonly clear: () => void;
  readonly addInstance: (
    tileX: number,
    tileY: number,
    sceneX: number,
    sceneZ: number,
    cornerYAt: (wx: number, wy: number) => number,
    dirs: RoadDirections
  ) => void;
  readonly commit: () => void;
  readonly dispose: () => void;
};

const ROAD_WIDTH = 0.12;
const HALF_WIDTH = ROAD_WIDTH * 0.5;
const HUB_RADIUS = 0.085;
const ARM_START_RADIUS = HUB_RADIUS * 0.72;
const Y_LIFT = 0.06;
const HUB_CENTER_LIFT = Y_LIFT + 0.01;
const CURVE_SAMPLES = 12;
const ARM_SAMPLES = 7;
const HUB_SEGMENTS = 16;

const ROAD_DIRS: readonly RoadDir[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest"
];

const BOUNDARY_POINTS: Record<RoadDir, (sx: number, sz: number) => [number, number]> = {
  north: (sx, sz) => [sx, sz - 0.5],
  south: (sx, sz) => [sx, sz + 0.5],
  east: (sx, sz) => [sx + 0.5, sz],
  west: (sx, sz) => [sx - 0.5, sz],
  northeast: (sx, sz) => [sx + 0.5, sz - 0.5],
  northwest: (sx, sz) => [sx - 0.5, sz - 0.5],
  southeast: (sx, sz) => [sx + 0.5, sz + 0.5],
  southwest: (sx, sz) => [sx - 0.5, sz + 0.5]
};

const ARM_DIRECTION: Record<RoadDir, [number, number]> = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0],
  northeast: [1, -1],
  northwest: [-1, -1],
  southeast: [1, 1],
  southwest: [-1, 1]
};

const cornerY = (
  wx: number,
  wz: number,
  cornerYAt: (wx: number, wy: number) => number
): number => {
  const ix = Math.floor(wx);
  const iz = Math.floor(wz);
  const fx = wx - ix;
  const fz = wz - iz;
  const a = cornerYAt(ix, iz);
  const b = cornerYAt(ix + 1, iz);
  const c = cornerYAt(ix, iz + 1);
  const d = cornerYAt(ix + 1, iz + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
};

const getCubicBezierPoint = (t: number, p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]): [number, number] => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  const x = mt3 * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t3 * p3[0];
  const y = mt3 * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t3 * p3[1];
  return [x, y];
};

const normalize = (v: [number, number]): [number, number] => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (len < 0.0001) return [0, 0];
  return [v[0] / len, v[1] / len];
};

const roadHash01 = (tileX: number, tileY: number, salt: number): number => {
  const v = Math.sin((tileX + 0.5) * 127.1 + (tileY + 0.5) * 311.7 + salt * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

const getTangent = (points: Array<[number, number]>, i: number): [number, number] => {
  if (points.length < 2) return [1, 0];
  if (i === 0) {
    const current = points[0]!;
    const next = points[1]!;
    return normalize([next[0] - current[0], next[1] - current[1]]);
  }
  if (i === points.length - 1) {
    const current = points[i]!;
    const previous = points[i - 1]!;
    return normalize([current[0] - previous[0], current[1] - previous[1]]);
  }
  const previous = points[i - 1]!;
  const next = points[i + 1]!;
  return normalize([next[0] - previous[0], next[1] - previous[1]]);
};

const activeRoadDirections = (dirs: RoadDirections): RoadDir[] =>
  ROAD_DIRS.filter((dir) => dirs[dir] === true);

const curvedArmPoints = (
  tileX: number,
  tileY: number,
  sceneX: number,
  sceneZ: number,
  dir: RoadDir
): Array<[number, number]> => {
  const outward = normalize(ARM_DIRECTION[dir]);
  const perp: [number, number] = [-outward[1], outward[0]];
  const [endX, endZ] = BOUNDARY_POINTS[dir](sceneX, sceneZ);
  const start: [number, number] = [
    sceneX + outward[0] * ARM_START_RADIUS,
    sceneZ + outward[1] * ARM_START_RADIUS
  ];
  const end: [number, number] = [endX, endZ];
  const length = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
  const bend = (roadHash01(tileX, tileY, ROAD_DIRS.indexOf(dir) + 1) - 0.5) * 0.11;
  const c1: [number, number] = [
    start[0] + outward[0] * length * 0.35 + perp[0] * bend,
    start[1] + outward[1] * length * 0.35 + perp[1] * bend
  ];
  // Keep the boundary tangent perpendicular to the tile edge/corner so
  // the adjacent tile's matching arm meets without a visible kink.
  const c2: [number, number] = [
    end[0] - outward[0] * length * 0.36,
    end[1] - outward[1] * length * 0.36
  ];

  const points: Array<[number, number]> = [];
  for (let i = 0; i < ARM_SAMPLES; i += 1) {
    const t = i / (ARM_SAMPLES - 1);
    points.push(getCubicBezierPoint(t, start, c1, c2, end));
  }
  return points;
};

const addRibbonGeometry = (
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
  vertexCount: { current: number },
  indexCount: { current: number },
  centerlinePoints: Array<[number, number]>,
  tileX: number,
  tileY: number,
  sceneX: number,
  sceneZ: number,
  cornerYAtFn: (wx: number, wy: number) => number
): void => {
  if (centerlinePoints.length < 2) return;

  // sceneX/sceneZ correspond to the tile *center* in world (tileX+0.5, tileY+0.5).
  // cornerYAt expects world tile-corner coords (NW corner of tile (wx,wy)), so
  // shift by +0.5 when converting from scene-relative to world.
  const sceneToWorldX = (px: number) => tileX + 0.5 + (px - sceneX);
  const sceneToWorldZ = (pz: number) => tileY + 0.5 + (pz - sceneZ);

  const leftVertices: number[] = [];
  const rightVertices: number[] = [];
  let arcLength = 0;

  for (let i = 0; i < centerlinePoints.length; i++) {
    const [cx, cz] = centerlinePoints[i]!;
    const tangent = getTangent(centerlinePoints, i);
    const perpX = -tangent[1];
    const perpZ = tangent[0];

    const leftX = cx - perpX * HALF_WIDTH;
    const leftZ = cz - perpZ * HALF_WIDTH;
    const rightX = cx + perpX * HALF_WIDTH;
    const rightZ = cz + perpZ * HALF_WIDTH;

    const wxLeft = sceneToWorldX(leftX);
    const wzLeft = sceneToWorldZ(leftZ);
    const wxRight = sceneToWorldX(rightX);
    const wzRight = sceneToWorldZ(rightZ);

    const leftY = cornerY(wxLeft, wzLeft, cornerYAtFn) + Y_LIFT;
    const rightY = cornerY(wxRight, wzRight, cornerYAtFn) + Y_LIFT;

    leftVertices.push(vertexCount.current);
    positions[vertexCount.current * 3] = leftX;
    positions[vertexCount.current * 3 + 1] = leftY;
    positions[vertexCount.current * 3 + 2] = leftZ;
    uvs[vertexCount.current * 2] = arcLength;
    uvs[vertexCount.current * 2 + 1] = 0;
    vertexCount.current++;

    rightVertices.push(vertexCount.current);
    positions[vertexCount.current * 3] = rightX;
    positions[vertexCount.current * 3 + 1] = rightY;
    positions[vertexCount.current * 3 + 2] = rightZ;
    uvs[vertexCount.current * 2] = arcLength;
    uvs[vertexCount.current * 2 + 1] = 1;
    vertexCount.current++;

    if (i < centerlinePoints.length - 1) {
      const [nx, nz] = centerlinePoints[i + 1]!;
      arcLength += Math.sqrt((nx - cx) * (nx - cx) + (nz - cz) * (nz - cz));
    }
  }

  for (let i = 0; i < centerlinePoints.length - 1; i++) {
    const li = leftVertices[i]!;
    const ri = rightVertices[i]!;
    const li1 = leftVertices[i + 1]!;
    const ri1 = rightVertices[i + 1]!;

    indices[indexCount.current++] = li;
    indices[indexCount.current++] = ri;
    indices[indexCount.current++] = li1;

    indices[indexCount.current++] = ri;
    indices[indexCount.current++] = ri1;
    indices[indexCount.current++] = li1;
  }
};

export const createRoadOverlay = (scene: Scene): RoadOverlay => {
  const group = new Group();
  group.name = "road-overlay";

  const maxVertices = 7000 * 140;
  const maxIndices = 7000 * 200;

  const positions = new Float32Array(maxVertices * 3);
  const uvs = new Float32Array(maxVertices * 2);
  const indices = new Uint32Array(maxIndices);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  geometry.setAttribute("uv", new BufferAttribute(uvs, 2).setUsage(DynamicDrawUsage));
  geometry.setIndex(new BufferAttribute(indices, 1).setUsage(DynamicDrawUsage));

  const vertexShader = `
    precision highp float;
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    precision highp float;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f*f*(3.0 - 2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), u.x),
                 mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
    }
    float fbm(vec2 p) { return 0.5*vnoise(p) + 0.25*vnoise(p*2.1) + 0.125*vnoise(p*4.3); }

    void main() {
      float u = vUv.x;
      float v = vUv.y;
      float dist = abs(v - 0.5) * 2.0;
      vec3 cCenter = vec3(0.847, 0.722, 0.541);
      vec3 cBody   = vec3(0.722, 0.580, 0.416);
      vec3 cBorder = vec3(0.353, 0.227, 0.122);
      vec3 col;
      if (dist < 0.10) col = cCenter;
      else if (dist < 0.20) col = mix(cCenter, cBody, smoothstep(0.0, 1.0, (dist - 0.10) / 0.10));
      else if (dist < 0.62) col = cBody;
      else if (dist < 0.88) col = mix(cBody, cBorder, smoothstep(0.0, 1.0, (dist - 0.62) / 0.26));
      else col = cBorder;
      float lowF = fbm(vec2(u * 6.0, v * 2.5));
      float grain = vnoise(vec2(u * 80.0, v * 80.0));
      col *= mix(0.85, 1.10, lowF);
      col += (grain - 0.5) * 0.05;
      float outerBody = smoothstep(0.45, 0.62, dist);
      col *= mix(1.0, 0.92, outerBody * fbm(vec2(u * 3.0, v * 1.5)));
      col *= 1.10;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 25;
  mesh.frustumCulled = false;
  group.add(mesh);
  scene.add(group);

  const vCount = { current: 0 };
  const iCount = { current: 0 };

  const clear = (): void => {
    vCount.current = 0;
    iCount.current = 0;
  };

  const addHub = (
    tileX: number,
    tileY: number,
    sceneX: number,
    sceneZ: number,
    cornerYAtFn: (wx: number, wy: number) => number
  ): void => {
    const hubCenterY = cornerY(tileX + 0.5, tileY + 0.5, cornerYAtFn) + HUB_CENTER_LIFT;

    const hubCenterIdx = vCount.current;
    positions[vCount.current * 3] = sceneX;
    positions[vCount.current * 3 + 1] = hubCenterY;
    positions[vCount.current * 3 + 2] = sceneZ;
    uvs[vCount.current * 2] = 0;
    uvs[vCount.current * 2 + 1] = 0.5;
    vCount.current++;

    const hubRimStartIdx = vCount.current;
    for (let i = 0; i < HUB_SEGMENTS; i += 1) {
      const theta = (2 * Math.PI * i) / HUB_SEGMENTS;
      const rimX = sceneX + Math.cos(theta) * HUB_RADIUS;
      const rimZ = sceneZ + Math.sin(theta) * HUB_RADIUS;
      const wxRim = tileX + 0.5 + (rimX - sceneX);
      const wzRim = tileY + 0.5 + (rimZ - sceneZ);
      const rimY = cornerY(wxRim, wzRim, cornerYAtFn) + Y_LIFT;

      positions[vCount.current * 3] = rimX;
      positions[vCount.current * 3 + 1] = rimY;
      positions[vCount.current * 3 + 2] = rimZ;
      uvs[vCount.current * 2] = i / HUB_SEGMENTS;
      uvs[vCount.current * 2 + 1] = 1.0;
      vCount.current++;
    }

    for (let i = 0; i < HUB_SEGMENTS; i += 1) {
      const next = (i + 1) % HUB_SEGMENTS;
      indices[iCount.current++] = hubCenterIdx;
      indices[iCount.current++] = hubRimStartIdx + i;
      indices[iCount.current++] = hubRimStartIdx + next;
    }
  };

  const addInstance = (
    tileX: number,
    tileY: number,
    sceneX: number,
    sceneZ: number,
    cornerYAtFn: (wx: number, wy: number) => number,
    dirs: RoadDirections
  ): void => {
    const arms = activeRoadDirections(dirs);

    if (arms.length === 0) return;

    if (arms.length === 2 && dirs.terminal !== true) {
      const [dir1, dir2] = arms as [RoadDir, RoadDir];
      const [p1x, p1z] = BOUNDARY_POINTS[dir1](sceneX, sceneZ);
      const [p2x, p2z] = BOUNDARY_POINTS[dir2](sceneX, sceneZ);

      const [d1x, d1z] = normalize(ARM_DIRECTION[dir1]);
      const [d2x, d2z] = normalize(ARM_DIRECTION[dir2]);

      const dist = Math.sqrt((p2x - p1x) ** 2 + (p2z - p1z) ** 2);
      const tangentLen = 0.45 * dist;

      const c1x = p1x - d1x * tangentLen;
      const c1z = p1z - d1z * tangentLen;
      const c2x = p2x - d2x * tangentLen;
      const c2z = p2z - d2z * tangentLen;

      const centerlinePoints: Array<[number, number]> = [];
      for (let i = 0; i < CURVE_SAMPLES; i++) {
        const t = i / (CURVE_SAMPLES - 1);
        const [x, z] = getCubicBezierPoint(t, [p1x, p1z], [c1x, c1z], [c2x, c2z], [p2x, p2z]);
        centerlinePoints.push([x, z]);
      }

      addRibbonGeometry(
        positions,
        uvs,
        indices,
        vCount,
        iCount,
        centerlinePoints,
        tileX,
        tileY,
        sceneX,
        sceneZ,
        cornerYAtFn
      );
    } else {
      addHub(tileX, tileY, sceneX, sceneZ, cornerYAtFn);

      for (const dir of arms) {
        addRibbonGeometry(
          positions,
          uvs,
          indices,
          vCount,
          iCount,
          curvedArmPoints(tileX, tileY, sceneX, sceneZ, dir),
          tileX,
          tileY,
          sceneX,
          sceneZ,
          cornerYAtFn
        );
      }
    }
  };

  const commit = (): void => {
    if (vCount.current > 0) {
      (geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
      (geometry.getAttribute("uv") as BufferAttribute).needsUpdate = true;
      (geometry.getIndex() as BufferAttribute).needsUpdate = true;
      geometry.setDrawRange(0, iCount.current);
    } else {
      geometry.setDrawRange(0, 0);
    }
  };

  const dispose = (): void => {
    scene.remove(group);
    geometry.dispose();
    material.dispose();
  };

  return {
    group,
    clear,
    addInstance,
    commit,
    dispose
  };
};
