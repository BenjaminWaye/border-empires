// Tool definitions for the subset of DurableCommandTypes this v1 bot can
// issue. EXPAND/ATTACK/SETTLE/BUILD_ECONOMIC_STRUCTURE (Relay Beacon plus a
// small curated set of resource-tile structures)/CHOOSE_TECH covers the core
// frontier-growth-and-economy loop (apps/simulation/src/ai/frontier-command-
// planner.ts covers the same frontier actions for the rule-based in-sim AI).
// The full economic-structure/tech/muster/diplomacy command surface is much
// larger than this -- deliberately not exposed here. Public research on LLM
// game-playing agents (e.g. CivBench, a similar 4X-genre benchmark) found
// that a large flat per-turn action space causes systematic underutilization
// of rarely-relevant tools rather than better play, especially for a cheap
// model choosing one action per turn -- so this tool list stays small and
// only grows when there's evidence a given capability is actually load-
// bearing for how this bot plays.
import type Anthropic from "@anthropic-ai/sdk";
import type { BotAction, BuildEconomicStructureAction, ChooseTechAction } from "./game-socket.js";
import { BUILDABLE_STRUCTURE_TYPES } from "./structures.js";
import { VIEWPORT_HALF_SIZE } from "./viewport.js";

export type PanCameraAction = { type: "PAN_CAMERA"; x: number; y: number };
export type ChosenAction = BotAction | BuildEconomicStructureAction | ChooseTechAction | PanCameraAction | "wait";

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
    name: "build_relay_beacon",
    description:
      "Build a Relay Beacon on a settled tile of yours that's on the edge of your empire (see \"beaconSites\"). This is the actual way to grow your reach beyond its current border -- it activates a reach disk that turns neutral land around it into free-to-claim frontier territory. Costs manpower and takes time to complete; there's no immediate confirmation, check back next session.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "integer", description: "X of a settled edge tile you own, from \"beaconSites\"" },
        y: { type: "integer", description: "Y of a settled edge tile you own, from \"beaconSites\"" }
      },
      required: ["x", "y"],
      additionalProperties: false
    }
  },
  {
    name: "build_structure",
    description:
      "Build a basic economic structure on a settled resource tile of yours that doesn't have one yet (see \"structureSites\"). FARMSTEAD develops a FARM tile, MINE develops a TITANIUM or GEMS tile -- both require the matching tech already researched, and are only offered when there's actually room to build them right now. No immediate confirmation, same as build_relay_beacon.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "integer", description: "X of a settled resource tile you own, from \"structureSites\"" },
        y: { type: "integer", description: "Y of a settled resource tile you own, from \"structureSites\"" },
        structureType: { type: "string", enum: [...BUILDABLE_STRUCTURE_TYPES], description: "Which structure to build, from the matching \"structureSites\" entry" }
      },
      required: ["x", "y", "structureType"],
      additionalProperties: false
    }
  },
  {
    name: "choose_tech",
    description:
      "Research a tech (see \"techChoices\" for what's currently reachable and affordable). Instant -- no build timer -- but costs gold up front and there's no immediate confirmation (no ack for this command); check \"techIds\" next turn to see if it landed.",
    input_schema: {
      type: "object",
      properties: {
        techId: { type: "string", description: "A tech id from \"techChoices\"" }
      },
      required: ["techId"],
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
  if (toolName === "build_relay_beacon") {
    const x = num("x");
    const y = num("y");
    if (x === undefined || y === undefined) return undefined;
    return { type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: "RELAY_BEACON" };
  }
  if (toolName === "build_structure") {
    const x = num("x");
    const y = num("y");
    const structureType = args.structureType;
    if (x === undefined || y === undefined || typeof structureType !== "string") return undefined;
    if (!(BUILDABLE_STRUCTURE_TYPES as readonly string[]).includes(structureType)) return undefined;
    return { type: "BUILD_ECONOMIC_STRUCTURE", x, y, structureType: structureType as (typeof BUILDABLE_STRUCTURE_TYPES)[number] };
  }
  if (toolName === "choose_tech") {
    const techId = args.techId;
    if (typeof techId !== "string" || techId.length === 0) return undefined;
    return { type: "CHOOSE_TECH", techId };
  }
  return undefined;
};
