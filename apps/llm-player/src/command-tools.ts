// Tool definitions for the subset of DurableCommandTypes this v1 bot can
// issue. EXPAND/ATTACK/SETTLE is the core frontier-growth loop
// (apps/simulation/src/ai/frontier-command-planner.ts covers the same
// actions for the rule-based in-sim AI); building, tech, and muster controls
// are deliberately left for a fast-follow once this loop is proven reliable.
import type Anthropic from "@anthropic-ai/sdk";
import type { BotAction } from "./game-socket.js";
import { VIEWPORT_HALF_SIZE } from "./viewport.js";

export type PanCameraAction = { type: "PAN_CAMERA"; x: number; y: number };
export type ChosenAction = BotAction | PanCameraAction | "wait";

export const COMMAND_TOOLS: Anthropic.Tool[] = [
  {
    name: "expand",
    description: "Claim an adjacent unowned tile, growing your territory from one of your own tiles into a neighboring tile you don't yet own.",
    input_schema: {
      type: "object",
      properties: {
        fromX: { type: "integer", description: "X of a tile you already own" },
        fromY: { type: "integer", description: "Y of a tile you already own" },
        toX: { type: "integer", description: "X of the adjacent unowned tile to claim" },
        toY: { type: "integer", description: "Y of the adjacent unowned tile to claim" }
      },
      required: ["fromX", "fromY", "toX", "toY"],
      additionalProperties: false
    }
  },
  {
    name: "attack",
    description: "Attack an adjacent tile owned by another player, from one of your own bordering tiles.",
    input_schema: {
      type: "object",
      properties: {
        fromX: { type: "integer", description: "X of a tile you already own" },
        fromY: { type: "integer", description: "Y of a tile you already own" },
        toX: { type: "integer", description: "X of the adjacent enemy-owned tile to attack" },
        toY: { type: "integer", description: "Y of the adjacent enemy-owned tile to attack" }
      },
      required: ["fromX", "fromY", "toX", "toY"],
      additionalProperties: false
    }
  },
  {
    name: "settle",
    description: "Found a settlement on a tile you own that isn't settled yet, to develop it.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "integer" },
        y: { type: "integer" }
      },
      required: ["x", "y"],
      additionalProperties: false
    }
  },
  {
    name: "wait",
    description: "Take no action this turn (e.g. nothing useful to do, or saving resources).",
    input_schema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "pan_camera",
    description: `Move your view to a new location on the map instead of acting -- e.g. somewhere the minimap shows unclaimed land or a rival's border. Next turn you'll see a fresh ~${VIEWPORT_HALF_SIZE * 2}x${VIEWPORT_HALF_SIZE * 2} tile area centered there. You can only expand/attack/settle tiles currently in view, so pan there first.`,
    input_schema: {
      type: "object",
      properties: {
        x: { type: "integer", description: "X to center your view on" },
        y: { type: "integer", description: "Y to center your view on" }
      },
      required: ["x", "y"],
      additionalProperties: false
    }
  }
];

export const botActionFromToolUse = (toolName: string, input: unknown): ChosenAction | undefined => {
  const args = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const num = (key: string): number | undefined => (typeof args[key] === "number" ? (args[key] as number) : undefined);

  if (toolName === "wait") return "wait";
  if (toolName === "expand" || toolName === "attack") {
    const fromX = num("fromX");
    const fromY = num("fromY");
    const toX = num("toX");
    const toY = num("toY");
    if (fromX === undefined || fromY === undefined || toX === undefined || toY === undefined) return undefined;
    return { type: toolName === "expand" ? "EXPAND" : "ATTACK", fromX, fromY, toX, toY };
  }
  if (toolName === "settle" || toolName === "pan_camera") {
    const x = num("x");
    const y = num("y");
    if (x === undefined || y === undefined) return undefined;
    return { type: toolName === "settle" ? "SETTLE" : "PAN_CAMERA", x, y };
  }
  return undefined;
};
