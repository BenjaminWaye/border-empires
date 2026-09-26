// Siphon "siphon mode" — the Aether Tower (Observatory) lock that replaced
// Siphon's old fixed 60-minute duration (docs/game-mechanics.md "Siphon").
//
// Casting Siphon locks one of the caster's Observatories into siphon mode:
// `observatory.siphon` records which tiles it is draining, and each drained
// tile carries a `sabotage` stamp whose `observatoryTileKey` points back at
// that tower. The siphon has no timer; it lasts until the caster cancels it
// (CANCEL_SIPHON), the victim activates an Observatory whose protection
// radius covers a drained tile, the caster's tower stops being an active
// tower they own, or a drained tile changes hands. While it lasts, every
// drained RESOURCE tile's slots count toward the caster's slot supply
// instead of the owner's (town tiles keep the old behaviour: output zeroed).
//
// Both halves live on tiles, so they persist through the same snapshot /
// hydration / event-recovery paths as every other tile field.
import type { Tile } from "../types.js";

export type ObservatorySiphonMode = NonNullable<NonNullable<Tile["observatory"]>["siphon"]>;
export type SiphonSabotage = NonNullable<Tile["sabotage"]>;

/**
 * `sabotage.endsAt` for a siphon-mode stamp. The siphon ends by an event, not
 * a clock, but every existing `endsAt > now` reader (yield views, client FX)
 * keeps working unchanged if the stamp simply never expires on its own.
 */
export const SIPHON_UNTIL_CANCELLED_ENDS_AT = Number.MAX_SAFE_INTEGER;

/** True when this sabotage stamp is a siphon-mode stamp owned by a live tower (vs a legacy timed one). */
export const isSiphonModeSabotage = <T extends { ownerId: string; observatoryTileKey?: string | undefined }>(
  sabotage: T | undefined
): sabotage is T & { observatoryTileKey: string } => typeof sabotage?.observatoryTileKey === "string";

/** True when this Observatory is locked into siphon mode (and so can't cast other abilities). */
export const isObservatoryInSiphonMode = (observatory: { siphon?: ObservatorySiphonMode | undefined } | undefined): boolean =>
  Boolean(observatory?.siphon && observatory.siphon.tileKeys.length > 0);
