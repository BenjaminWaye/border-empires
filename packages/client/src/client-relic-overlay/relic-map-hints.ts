import { parseGuideCampLead, type GuideCampLead, parseGuideTownLead, parseRelicMapHints, isChosenTrickleResource, type GuideTownLead, relicRemainingUses, type ChosenTrickleResource, type NaturalWonderState, type RelicMapHint } from "@border-empires/shared";

export { announceRelicWakesForClient } from "./relic-wake-notice.js";

export interface RelicHintClientState {
  relicMapHints: Map<string, RelicMapHint>;
  tilesRevision: number;
  relicMapHintsRevision: number;
  chosenTrickleResource: ChosenTrickleResource | undefined;
  wonderLastFreeRushBuyAt: number | undefined;
  /** The guide's town lead (PLAYER_UPDATE guideTownLead): the nearest unowned town while the player holds none. */
  guideTownLead: GuideTownLead | undefined;
  /** The guide's camp lead (PLAYER_UPDATE guideCampLead): the nearest live Insurgent camp the player has never seen. */
  guideCampLead: GuideCampLead | undefined;
}
/** The small shared progression fields have one typed wire boundary. */
export function applyRelicAndProgressionUpdate(state: RelicHintClientState, message: Record<string, unknown>): void {
  if (isChosenTrickleResource(message.chosenTrickleResource)) state.chosenTrickleResource = message.chosenTrickleResource;
  if (typeof message.wonderLastFreeRushBuyAt === "number") state.wonderLastFreeRushBuyAt = message.wonderLastFreeRushBuyAt;
  if ("guideTownLead" in message) state.guideTownLead = parseGuideTownLead(message.guideTownLead) ?? undefined;
  if ("guideCampLead" in message) state.guideCampLead = parseGuideCampLead(message.guideCampLead) ?? undefined;
  if (!("relicMapHints" in message)) return;
  const next = new Map(parseRelicMapHints(message.relicMapHints).map(hint => [`${hint.x},${hint.y}`, hint]));
  if (JSON.stringify([...next]) === JSON.stringify([...state.relicMapHints])) return;
  state.relicMapHints = next;
  state.tilesRevision += 1;
  state.relicMapHintsRevision += 1;
}
/** Aether-wake colour when the operating House's colour is unknown to this client. */
export const RELIC_WAKE_FALLBACK_COLOR = "#b98cff";

/**
 * The anonymous transponder beam only stands in for a relic the player cannot
 * see yet: once the tile itself carries the relic, the model is on the map and
 * the beam is hidden. An aether wake (a rival operating the relic) always
 * shows: the server sends it only while the relic operates, and the remembered
 * tile may be out of date. Survey signatures stay unless the relic there is depleted.
 */
export function shouldDrawRelicHint(hint: RelicMapHint | undefined, tile: { naturalWonder?: NaturalWonderState | null | undefined } | undefined): hint is RelicMapHint {
  if (!hint) return false;
  if (hint.kind === "WAKE" || !tile?.naturalWonder) return true;
  return hint.kind !== "RELIC" && relicRemainingUses(tile.naturalWonder) !== 0;
}
export function drawRelicHint2D(ctx: CanvasRenderingContext2D, hint: RelicMapHint | undefined, tile: { naturalWonder?: NaturalWonderState | null | undefined } | undefined, x: number, y: number, size: number, _ownerColor?: (ownerId: string) => string): void {
  if (!shouldDrawRelicHint(hint, tile)) return;
  // Wakes and transponders are named plates now (relic-site-plates.ts), on both renderers; only survey signatures draw here.
  if (hint.kind !== "RESOURCE") return;
  ctx.save();
  const cx = x + size / 2, cy = y + size / 2;
  ctx.fillStyle = "#202b2b"; ctx.strokeStyle = "#b5c4af"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(7, size * 0.22), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#eee7cd"; ctx.font = `bold ${Math.max(9, size * 0.24)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(hint.resource === "TITANIUM" ? "Ti" : hint.resource === "CRYSTAL" ? "Cr" : "Um", cx, cy);
  ctx.restore();
}
