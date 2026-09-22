// Calls Claude to (a) pick one action per turn via tool use, and (b) write a
// short subjective session journal at the end. Haiku 4.5 is the cheapest
// current Claude model and the right fit here: picking a structured action
// from a small summarized state is a low-reasoning, high-frequency task, not
// one where a more expensive model's extra reasoning buys anything. See
// shared/cost-optimization.md's workload-shape guidance in the claude-api
// skill for the same conclusion.
import Anthropic from "@anthropic-ai/sdk";
import { botActionFromToolUse, COMMAND_TOOLS } from "./command-tools.js";
import type { BotAction } from "./game-socket.js";
import type { StateSummary } from "./state-summary.js";

const MODEL = "claude-haiku-4-5";

// Cached every turn via cache_control below -- only the per-turn state
// summary after it is paid at full input-token price. Haiku 4.5 doesn't
// support the adaptive-thinking/effort params (those are Opus/Sonnet-tier
// only), so this is a plain tool-use call.
const SYSTEM_PROMPT = `You are playing Border Empires, a persistent tile-based territory-conquest strategy game, as an autonomous player controlling one empire.

Each turn you get a compact snapshot of your empire (gold, manpower, a sample of tiles you own, and the "frontier" -- unowned or enemy tiles directly adjacent to your territory) and must call exactly one tool to act, or call "wait" if there's nothing worth doing right now.

Rules of thumb:
- Only frontier tiles are valid expand/attack targets, and only from a tile you already own that borders them.
- Prefer expanding into unclaimed (no ownerId) frontier tiles over attacking another player's tiles.
- Settle owned tiles you haven't developed yet when you can afford it.
- Don't attack indiscriminately -- treat other players' territory with the same restraint a considerate human player would.
- If gold or manpower looks too low for a costly move, wait instead of forcing an action.`;

export type Decision = { action: BotAction | "wait" };

export const decideNextAction = async (client: Anthropic, summary: StateSummary): Promise<Decision> => {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: COMMAND_TOOLS,
    tool_choice: { type: "auto" },
    messages: [
      {
        role: "user",
        content: `Current state:\n${JSON.stringify(summary)}\n\nChoose your next action.`
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
