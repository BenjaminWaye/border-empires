import { BufferAttribute, BufferGeometry } from "three";
import { toroidDelta } from "../client-map-3d-pointer-pick.js";

export type ObservatoryRangeBorderGeometryInputs = {
  readonly selectedX: number;
  readonly selectedY: number;
  readonly camX: number;
  readonly camY: number;
  readonly radius: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly wrapX: (x: number) => number;
  readonly wrapY: (y: number) => number;
  readonly cornerYAt: (cornerX: number, cornerZ: number) => number;
  readonly riseAboveSurface: number;
};

export const observatoryRangeBorderSegmentCount = (radius: number): number => Math.max(0, Math.floor(radius) * 2 + 1) * 4;
export const observatoryRangeFillVertexCount = (radius: number): number => {
  const tileWidth = Math.max(0, Math.floor(radius) * 2 + 1);
  return tileWidth * tileWidth * 6;
};

export const createObservatoryRangeBorderGeometry = (maxSegments: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(Math.max(0, maxSegments) * 2 * 3), 3));
  geometry.setDrawRange(0, 0);
  return geometry;
};

export const createObservatoryRangeFillGeometry = (maxVertices: number): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(Math.max(0, maxVertices) * 3), 3));
  geometry.setDrawRange(0, 0);
  return geometry;
};

export const writeObservatoryRangeBorderGeometry = (
  geometry: BufferGeometry,
  inputs: ObservatoryRangeBorderGeometryInputs
): number => {
  const radius = Math.max(0, Math.floor(inputs.radius));
  const expectedSegments = observatoryRangeBorderSegmentCount(radius);
  const positionAttr = geometry.getAttribute("position") as BufferAttribute | undefined;
  if (!positionAttr) return 0;
  const positions = positionAttr.array as Float32Array;
  if (positions.length < expectedSegments * 2 * 3) {
    throw new Error(`observatory range geometry too small for radius ${radius}`);
  }

  const selectedLocalX = toroidDelta(inputs.camX, inputs.selectedX, inputs.worldWidth);
  const selectedLocalZ = toroidDelta(inputs.camY, inputs.selectedY, inputs.worldHeight);
  const left = inputs.selectedX - radius;
  const right = inputs.selectedX + radius + 1;
  const top = inputs.selectedY - radius;
  const bottom = inputs.selectedY + radius + 1;
  let offset = 0;

  const writeCorner = (cornerX: number, cornerZ: number): void => {
    const wrappedX = inputs.wrapX(cornerX);
    const wrappedZ = inputs.wrapY(cornerZ);
    positions[offset++] = selectedLocalX + (cornerX - inputs.selectedX);
    positions[offset++] = inputs.cornerYAt(wrappedX, wrappedZ) + inputs.riseAboveSurface;
    positions[offset++] = selectedLocalZ + (cornerZ - inputs.selectedY);
  };
  const writeSegment = (ax: number, az: number, bx: number, bz: number): void => {
    writeCorner(ax, az);
    writeCorner(bx, bz);
  };

  for (let x = left; x < right; x += 1) writeSegment(x, top, x + 1, top);
  for (let z = top; z < bottom; z += 1) writeSegment(right, z, right, z + 1);
  for (let x = right; x > left; x -= 1) writeSegment(x, bottom, x - 1, bottom);
  for (let z = bottom; z > top; z -= 1) writeSegment(left, z, left, z - 1);

  positionAttr.needsUpdate = true;
  geometry.setDrawRange(0, expectedSegments * 2);
  return expectedSegments;
};

export const writeObservatoryRangeFillGeometry = (
  geometry: BufferGeometry,
  inputs: ObservatoryRangeBorderGeometryInputs
): number => {
  const radius = Math.max(0, Math.floor(inputs.radius));
  const expectedVertices = observatoryRangeFillVertexCount(radius);
  const positionAttr = geometry.getAttribute("position") as BufferAttribute | undefined;
  if (!positionAttr) return 0;
  const positions = positionAttr.array as Float32Array;
  if (positions.length < expectedVertices * 3) {
    throw new Error(`observatory range fill geometry too small for radius ${radius}`);
  }

  const selectedLocalX = toroidDelta(inputs.camX, inputs.selectedX, inputs.worldWidth);
  const selectedLocalZ = toroidDelta(inputs.camY, inputs.selectedY, inputs.worldHeight);
  const left = inputs.selectedX - radius;
  const right = inputs.selectedX + radius + 1;
  const top = inputs.selectedY - radius;
  const bottom = inputs.selectedY + radius + 1;
  let offset = 0;

  const writeCorner = (cornerX: number, cornerZ: number): void => {
    const wrappedX = inputs.wrapX(cornerX);
    const wrappedZ = inputs.wrapY(cornerZ);
    positions[offset++] = selectedLocalX + (cornerX - inputs.selectedX);
    positions[offset++] = inputs.cornerYAt(wrappedX, wrappedZ) + inputs.riseAboveSurface;
    positions[offset++] = selectedLocalZ + (cornerZ - inputs.selectedY);
  };
  const writeTile = (x: number, z: number): void => {
    writeCorner(x, z);
    writeCorner(x, z + 1);
    writeCorner(x + 1, z);
    writeCorner(x + 1, z);
    writeCorner(x, z + 1);
    writeCorner(x + 1, z + 1);
  };

  for (let z = top; z < bottom; z += 1) {
    for (let x = left; x < right; x += 1) writeTile(x, z);
  }

  positionAttr.needsUpdate = true;
  geometry.setDrawRange(0, expectedVertices);
  return expectedVertices;
};
