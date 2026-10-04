// Token accounting for the decision calls, so a session's real cost is visible
// instead of guessed. Prices are Claude Haiku 4.5 list prices per million
// tokens (see MODEL in llm-agent.ts); update them together if the model
// changes. Cache reads bill at 0.1x input and 5-minute cache writes at 1.25x.
const INPUT_USD_PER_MTOK = 1;
const OUTPUT_USD_PER_MTOK = 5;
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

export type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type CallUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export const emptyUsage = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

export const addUsage = (totals: UsageTotals, usage: CallUsage): UsageTotals => ({
  calls: totals.calls + 1,
  inputTokens: totals.inputTokens + usage.input_tokens,
  outputTokens: totals.outputTokens + usage.output_tokens,
  cacheReadTokens: totals.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
  cacheWriteTokens: totals.cacheWriteTokens + (usage.cache_creation_input_tokens ?? 0)
});

export const estimateCostUsd = (totals: UsageTotals): number =>
  (totals.inputTokens * INPUT_USD_PER_MTOK +
    totals.cacheReadTokens * INPUT_USD_PER_MTOK * CACHE_READ_MULTIPLIER +
    totals.cacheWriteTokens * INPUT_USD_PER_MTOK * CACHE_WRITE_MULTIPLIER +
    totals.outputTokens * OUTPUT_USD_PER_MTOK) /
  1_000_000;

// Zero cache reads across several calls means the static prefix isn't being
// cached (Haiku 4.5 needs a >= 4096-token prefix) -- worth saying out loud.
export const describeUsage = (totals: UsageTotals): string => {
  const cacheNote =
    totals.calls > 1 && totals.cacheReadTokens === 0 ? " -- NO cache hits, the prompt prefix isn't being cached" : "";
  return `${totals.calls} calls: ${totals.inputTokens} uncached in, ${totals.cacheReadTokens} cache-read, ${totals.cacheWriteTokens} cache-write, ${totals.outputTokens} out (~$${estimateCostUsd(totals).toFixed(3)})${cacheNote}`;
};
