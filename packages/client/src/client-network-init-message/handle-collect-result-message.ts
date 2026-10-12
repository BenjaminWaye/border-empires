// Extracted from client-network.ts's WebSocket message dispatch (already
// over the repo's 500-line cap and may not grow) to make room for the new
// HINT_STATE_SET handler added alongside it.
export type HandleCollectResultMessageDeps = {
  state: { pendingShardCollect: unknown };
  pushFeed: (text: string, kind: string, severity: string) => void;
  renderHud: () => void;
};

export const handleCollectResultMessage = (msg: Record<string, unknown>, deps: HandleCollectResultMessageDeps): void => {
  const { state, pushFeed, renderHud } = deps;
  state.pendingShardCollect = undefined;
  const gold = Number(msg.gold ?? 0);
  const strategic = (msg.strategic as Record<string, number> | undefined) ?? {};
  const strategicParts = Object.entries(strategic)
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${Number(value).toFixed(1)} ${resource}`);
  const bits: string[] = [];
  if (gold > 0) bits.push(`${gold.toFixed(1)} coin`);
  bits.push(...strategicParts);
  pushFeed(bits.length > 0 ? `Collected ${bits.join(", ")}.` : "No collectable yield.", "info", bits.length > 0 ? "success" : "warn");
  renderHud();
};
