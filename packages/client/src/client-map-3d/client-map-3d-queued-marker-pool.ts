import { LineBasicMaterial, LineSegments } from "three";
import { createBendingMarkerGeometry } from "../client-map-3d-bending-marker-geometry/client-map-3d-bending-marker-geometry.js";

export type QueuedTileMarker = { marker: LineSegments; material: LineBasicMaterial };

/** Size of each queued-tile marker pool (queued actions, settlements, builds). */
export const QUEUED_TILE_MARKER_POOL_SIZE = 64;

/**
 * A pool of hidden tile outlines in one color, drawn over the terrain
 * (no depth test). client-map-3d.ts keeps one pool per queue kind and
 * shows a marker per queued tile.
 */
export const createQueuedTileMarkerPool = (color: string, opacity: number): QueuedTileMarker[] =>
  Array.from({ length: QUEUED_TILE_MARKER_POOL_SIZE }, () => {
    const material = new LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
    const marker = new LineSegments(createBendingMarkerGeometry(), material);
    marker.visible = false;
    return { marker, material };
  });
