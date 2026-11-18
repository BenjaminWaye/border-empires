import type { Tile } from "./client-types.js";
import { drawHoloCrates2D } from "./client-waystation-holo-crates/holo-crate-2d.js";
import { waystationOpenPose, type WaystationOpenFxEntry } from "./client-waystation-holo-crates/holo-crate-open-fx.js";

/** Canvas counterpart of the Holo-Locked Stack: three crates on an anti-grav pad under a hologram padlock. */
export const drawWaystation2D = (
  ctx: CanvasRenderingContext2D,
  tile: Pick<Tile, "x" | "y" | "waystation">,
  px: number, py: number, size: number, nowMs: number,
  still = false
): void => {
  if (!tile.waystation || tile.waystation.activated) return;
  drawHoloCrates2D(ctx, px, py, size, nowMs, { still });
};

/** A collected site's 10 s opening (padlock shatters, a crate opens, the site teleports out). */
export const drawWaystationOpening2D = (
  ctx: CanvasRenderingContext2D, entry: WaystationOpenFxEntry | undefined,
  px: number, py: number, size: number, nowMs: number, nowEpochMs: number
): void => {
  if (!entry) return;
  const pose = waystationOpenPose(nowEpochMs - entry.startedAt);
  if (!pose.done) drawHoloCrates2D(ctx, px, py, size, nowMs, { pose });
};
