// Calls Claude to (a) pick one action per turn via tool use, and (b) write a
// short subjective session journal at the end. Haiku 4.5 is the cheapest
// current Claude model and the right fit here: picking a structured action
// from a small summarized state is a low-reasoning, high-frequency task, not
// one where a more expensive model's extra reasoning buys anything. See
// shared/cost-optimization.md's workload-shape guidance in the claude-api
// skill for the same conclusion.
import Anthropic from "@anthropic-ai/sdk";
import { botActionFromToolUse, COMMAND_TOOLS, type ChosenAction } from "./command-tools.js";
import type { TurnContext } from "./state-summary.js";
import { VIEWPORT_HALF_SIZE } from "./viewport.js";

const MODEL = "claude-haiku-4-5";

// Cached every turn via cache_control below -- only the per-turn state
// summary after it is paid at full input-token price. Haiku 4.5 doesn't
// support the adaptive-thinking/effort params (those are Opus/Sonnet-tier
// only), so this is a plain tool-use call.
const SYSTEM_PROMPT = `You are playing Border Empires, a persistent tile-based territory-conquest strategy game, as an autonomous player controlling one empire.

You don't see your whole empire at once -- like a human player, you see a "viewport": a ~${VIEWPORT_HALF_SIZE * 2}x${VIEWPORT_HALF_SIZE * 2} tile window centered on your camera position. You also get a coarse "minimap": a low-resolution grid of every area you've ever explored, showing roughly who controls each area (dominant ownerId per cell) -- like glancing at the minimap widget to get your bearings.

You also get "recentEvents": a short list of the most recent notable things that happened to your empire (most recent first), each with a type, a short text description, when it happened, and sometimes a location (x, y). This is the same feed a human player would check after being away -- treat it like your activity feed / notification log. In particular, watch for events that mean your territory is under threat (e.g. an attack on one of your tiles): if you see one, consider panning your camera to that event's (x, y) so you can assess and respond (reinforce by expanding nearby, or otherwise defend that area) instead of only ever expanding blindly outward. Not every event needs a reaction -- use judgment, and don't fixate on an old event that's no longer actionable.

Each turn, call exactly one tool:
- "expand" / "attack" -- only valid on tiles in your current viewport's "frontier" list (unowned or enemy tiles adjacent to territory you own, within view).
- "settle" -- only valid on a tile you already own that's currently in your "viewport" list (not the frontier list, which is unowned/enemy tiles by definition). If it's already settled, the game will reject the attempt.
- "pan_camera" -- move your view somewhere else (pick a spot using the minimap or recentEvents, e.g. toward unclaimed territory, a rival's border, or a recent attack) if there's nothing worth doing in your current view. You'll see that area's viewport next turn.
- "wait" -- nothing worth doing at all right now.

Rules of thumb:
- Prefer expanding into unclaimed (no ownerId) frontier tiles over attacking another player's tiles.
- Settle owned tiles you haven't developed yet when you can afford it.
- Don't attack indiscriminately -- treat other players' territory with the same restraint a considerate human player would.
- If gold or manpower looks too low for a costly move, wait instead of forcing an action.
- Don't pan back and forth aimlessly -- use the minimap and recentEvents to make a purposeful choice about where to look.`;

export type Decision = { action: ChosenAction };

export const decideNextAction = async (client: Anthropic, context: TurnContext): Promise<Decision> => {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: COMMAND_TOOLS,
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `Current state:\n${JSON.stringify(context)}\n\nChoose your next action.`
      }
    ]
  });

  for (const block of response.content) {
    if (block.type === "tool_use") {
      const action = botActionFromToolUse(block.name, block.input);
      if (action) return { action };
    }
  }
  return { action: "wait" };
};

const JOURNAL_SYSTEM_PROMPT = `You just finished a play session in Border Empires, a persistent territory-conquest strategy game, as an autonomous AI player.
Write a short (3-5 sentence), first-person, informal note about the session for the humans building this game: what you did, anything that felt boring, repetitive, confusing, or unclear about the game or the information available to you, and one concrete suggestion if you have one. Be honest and specific rather than generically positive.`;

export const writeSessionJournal = async (client: Anthropic, sessionLog: string[]): Promise<string> => {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 512,
    system: JOURNAL_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `This session's actions:\n${sessionLog.join("\n")}` }]
  });
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  return textBlock?.text ?? "";
};

export const createAnthropicClient = (apiKey: string): Anthropic => new Anthropic({ apiKey });
