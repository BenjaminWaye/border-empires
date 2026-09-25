// 2D canvas drawing for the strategic map (design doc §22). Territory patches
// are drawn as thick round-capped strokes along same-owner starlanes plus a
// disc at every member system, so adjacent holdings visibly fuse into one
// bigger blob with no authored borders. Uses the same brass/amber palette as
// the rest of Space View chrome.
import type { SpacePlanetState } from "../client-space-view-state.js";
import {
  fitTransform,
  shouldLabelSystem,
  type Starlane,
  type StrategicNode,
  type TerritoryPatch
} from "./client-strategic-map-layout.js";

export type StrategicMapModel = {
  nodes: ReadonlyArray<StrategicNode>;
  lanes: ReadonlyArray<Starlane>;
  patches: ReadonlyArray<TerritoryPatch>;
  // Systems one of the player's Probes is orbiting (§26.7), marked on the map.
  orbiting: ReadonlySet<string>;
};

type PaintStyle = { fill: string; halo: string; glow: string; dot: string };

const PAINT: Record<SpacePlanetState, PaintStyle> = {
  owned: { fill: "rgba(214,150,68,0.32)", halo: "rgba(214,150,68,0.10)", glow: "rgba(255,214,143,0.55)", dot: "#ffd68f" },
  contested: { fill: "rgba(200,60,50,0.30)", halo: "rgba(200,60,50,0.10)", glow: "rgba(255,110,90,0.55)", dot: "#ff6b58" },
  other: { fill: "rgba(70,170,160,0.26)", halo: "rgba(70,170,160,0.09)", glow: "rgba(110,210,200,0.45)", dot: "#6fd2c6" },
  frontier: { fill: "rgba(0,0,0,0)", halo: "rgba(0,0,0,0)", glow: "rgba(0,0,0,0)", dot: "#7f8a99" },
  unknown: { fill: "rgba(0,0,0,0)", halo: "rgba(0,0,0,0)", glow: "rgba(0,0,0,0)", dot: "#3d4654" }
};

const PATCH_LANE_WIDTH = 26;
const PATCH_NODE_RADIUS = 15;

const dotRadius = (state: SpacePlanetState): number => (state === "owned" ? 6 : state === "unknown" ? 2.5 : state === "frontier" ? 3 : 4.5);

export const drawStrategicMap = (
  ctx: CanvasRenderingContext2D,
  model: StrategicMapModel,
  width: number,
  height: number,
  nowMs: number
): void => {
  const { toScreen } = fitTransform(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#050302";
  ctx.fillRect(0, 0, width, height);

  const centre = toScreen({ x: 0, y: 0 });

  // Starlanes: thin, quiet, real-neighbour links only. Nothing touches the Core.
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(160,140,110,0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const [a, b] of model.lanes) {
    const pa = toScreen(model.nodes[a]!.point);
    const pb = toScreen(model.nodes[b]!.point);
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
  }
  ctx.stroke();

  // Territory patches: one fused blob per connected same-owner group. A wide
  // faint halo under a tighter core gives soft, organic edges.
  const drawPatchPass = (patch: TerritoryPatch, fill: string, laneWidth: number, nodeRadius: number): void => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = fill;
    ctx.lineWidth = laneWidth;
    const members = new Set(patch.nodeIndices);
    ctx.beginPath();
    for (const [a, b] of model.lanes) {
      if (!members.has(a) || !members.has(b)) continue;
      const pa = toScreen(model.nodes[a]!.point);
      const pb = toScreen(model.nodes[b]!.point);
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
    }
    ctx.stroke();
    for (const index of patch.nodeIndices) {
      const p = toScreen(model.nodes[index]!.point);
      ctx.beginPath();
      ctx.arc(p.x, p.y, nodeRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const patch of model.patches) {
    const paint = PAINT[patch.state];
    drawPatchPass(patch, paint.halo, PATCH_LANE_WIDTH * 1.9, PATCH_NODE_RADIUS * 1.9);
    drawPatchPass(patch, paint.fill, PATCH_LANE_WIDTH, PATCH_NODE_RADIUS);
  }

  // The Core: a fixed landmark at the centre, drawn but never connected.
  const pulse = 0.5 + 0.5 * Math.sin(nowMs / 900);
  const halo = ctx.createRadialGradient(centre.x, centre.y, 2, centre.x, centre.y, 46);
  halo.addColorStop(0, `rgba(255,214,143,${0.35 + 0.15 * pulse})`);
  halo.addColorStop(1, "rgba(255,214,143,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd68f";
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,214,143,0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, 13, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#e8cf9f";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("THE COURT", centre.x, centre.y + 30);

  // Systems.
  for (const node of model.nodes) {
    const p = toScreen(node.point);
    const paint = PAINT[node.model.state];
    if (node.model.state === "owned" || node.model.state === "contested") {
      ctx.fillStyle = paint.glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, dotRadius(node.model.state) + 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = paint.dot;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotRadius(node.model.state), 0, Math.PI * 2);
    ctx.fill();
    if (node.model.underThreat) {
      const ring = 10 + 3 * (0.5 + 0.5 * Math.sin(nowMs / 250));
      ctx.strokeStyle = "rgba(255,90,70,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, ring, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Probe orbit marker: a tilted dashed ellipse with a small craft on it.
  ctx.strokeStyle = "rgba(150,200,255,0.9)";
  ctx.fillStyle = "rgba(150,200,255,0.95)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  for (const node of model.nodes) {
    if (!model.orbiting.has(node.model.seasonId)) continue;
    const p = toScreen(node.point);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 14, 7, -0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x + 11, p.y - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.setLineDash([]);

  // Labels: only notable systems (§22.2).
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.textAlign = "left";
  for (const node of model.nodes) {
    if (!shouldLabelSystem(node.model)) continue;
    const p = toScreen(node.point);
    ctx.fillStyle = "rgba(5,3,2,0.7)";
    const text = node.model.label;
    const w = ctx.measureText(text).width;
    ctx.fillRect(p.x + 10, p.y - 18, w + 8, 16);
    ctx.fillStyle = "#f0e0c8";
    ctx.fillText(text, p.x + 14, p.y - 6);
  }
};
