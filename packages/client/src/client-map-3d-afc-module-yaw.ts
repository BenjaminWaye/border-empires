import type { Matrix4 } from "three";

/**
 * Yaw for a docked AFC module, rotating about the module's own dock anchor.
 *
 * Every module family composes `yawMatrix * pieceMatrix`, where the piece
 * matrix already holds the scene-absolute position of the piece
 * (anchor + local offset). A plain Y rotation there swings the whole module
 * around the WORLD ORIGIN, not around its dock: socket 0 (yaw 0) is
 * unaffected, so the first module docked correctly, while every other socket
 * flung its module along an arc around the map origin -- nowhere near the AFC.
 * This builds T(anchor) * R(-yaw) * T(-anchor) so only the piece's offset from
 * the anchor rotates.
 */
export const makeYawAboutAnchor = (out: Matrix4, yaw: number, anchorX: number, anchorZ: number): Matrix4 => {
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  out.makeRotationY(-yaw);
  // Rotating the anchor itself by R(-yaw) about Y: x' = x cos + z sin, z' = -x sin + z cos.
  out.setPosition(anchorX - (anchorX * cos + anchorZ * sin), 0, anchorZ - (-anchorX * sin + anchorZ * cos));
  return out;
};
