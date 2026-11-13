import { parseRelicMapHints, isChosenTrickleResource, relicRemainingUses, type ChosenTrickleResource, type NaturalWonderState, type RelicMapHint } from "@border-empires/shared";

export interface RelicHintClientState {
  relicMapHints: Map<string, RelicMapHint>;
  tilesRevision: number;
  relicMapHintsRevision: number;
  chosenTrickleResource: ChosenTrickleResource | undefined;
  wonderLastFreeRushBuyAt: number | undefined;
}
/** The small shared progression fields have one typed wire boundary. */
export function applyRelicAndProgressionUpdate(state: RelicHintClientState, message: Record<string, unknown>): void {
  if (isChosenTrickleResource(message.chosenTrickleResource)) state.chosenTrickleResource = message.chosenTrickleResource;
  if (typeof message.wonderLastFreeRushBuyAt === "number") state.wonderLastFreeRushBuyAt = message.wonderLastFreeRushBuyAt;
  if (!("relicMapHints" in message)) return;
  const next = new Map(parseRelicMapHints(message.relicMapHints).map(hint => [`${hint.x},${hint.y}`, hint]));
  if (JSON.stringify([...next]) === JSON.stringify([...state.relicMapHints])) return;
  state.relicMapHints = next;
  state.tilesRevision += 1;
  state.relicMapHintsRevision += 1;
}
/**
 * The anonymous transponder beam only stands in for a relic the player cannot
 * see yet: once the tile itself carries the relic, the model is on the map and
 * the beam is hidden. Survey signatures stay unless the relic there is depleted.
 */
export function shouldDrawRelicHint(hint: RelicMapHint | undefined, tile: { naturalWonder?: NaturalWonderState | null | undefined } | undefined): hint is RelicMapHint {
  if (!hint) return false;
  if (!tile?.naturalWonder) return true;
  return hint.kind !== "RELIC" && relicRemainingUses(tile.naturalWonder) !== 0;
}
export function drawRelicHint2D(ctx: CanvasRenderingContext2D, hint: RelicMapHint | undefined, tile: { naturalWonder?: NaturalWonderState | null | undefined } | undefined, x: number, y: number, size: number): void {
  if (!shouldDrawRelicHint(hint, tile)) return;
  ctx.save();
  const cx = x + size / 2, cy = y + size / 2;
  if (hint.kind === "RELIC") {
    const gradient = ctx.createLinearGradient(cx, cy - size * 2.8, cx, cy);
    gradient.addColorStop(0, "rgba(211,231,190,0)"); gradient.addColorStop(1, "rgba(211,231,190,0.65)");
    ctx.fillStyle = gradient; ctx.fillRect(cx - Math.max(1.5, size * 0.06), cy - size * 2.8, Math.max(3, size * 0.12), size * 2.8);
    ctx.strokeStyle = "#d3e7be"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - 3, cy - 3, 6, 6);
  } else {
    ctx.fillStyle = "#202b2b"; ctx.strokeStyle = "#b5c4af"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(7, size * 0.22), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#eee7cd"; ctx.font = `bold ${Math.max(9, size * 0.24)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(hint.resource === "TITANIUM" ? "Ti" : hint.resource === "CRYSTAL" ? "Cr" : "Um", cx, cy);
  }
  ctx.restore();
}
