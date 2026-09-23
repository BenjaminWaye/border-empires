// What needs the player's attention right now, most urgent first (§24.4). Pure:
// derived from the system views and a few flags, so it is cheap to test.
import { hitsRemaining } from "../galaxy-duke-engine/galaxy-duke-combat.js";
import type { SystemView } from "./galaxy-duke-system-view.js";

export type AttentionKind =
  | "INCURSION_UNDEFENDED"
  | "INCURSION_DEFENDED"
  | "LOW_STABILITY"
  | "SLOT_EMPTY"
  | "FIGHTER_DAMAGED"
  | "COURT_OFFER"
  | "PETITION_READY";

export type AttentionItem = {
  kind: AttentionKind;
  severity: "URGENT" | "NOTICE";
  // The system to open when the player taps the item, or null for a general one.
  seasonId: string | null;
  label: string;
  // For incursions: when the craft arrives.
  at: number | null;
};

const ORDER: Record<AttentionKind, number> = {
  INCURSION_UNDEFENDED: 0,
  LOW_STABILITY: 1,
  COURT_OFFER: 2,
  INCURSION_DEFENDED: 3,
  FIGHTER_DAMAGED: 4,
  SLOT_EMPTY: 5,
  PETITION_READY: 6
};

export const buildAttention = (input: {
  systems: ReadonlyArray<SystemView>;
  courtOfferPending: boolean;
  petitionReady: boolean;
}): AttentionItem[] => {
  const items: AttentionItem[] = [];
  for (const s of input.systems) {
    const defended = s.fighters.some((h) => h > 0);
    if (s.incursionArrivesAt !== null) {
      items.push({ kind: defended ? "INCURSION_DEFENDED" : "INCURSION_UNDEFENDED", severity: defended ? "NOTICE" : "URGENT", seasonId: s.seasonId, label: s.label, at: s.incursionArrivesAt });
    }
    if (hitsRemaining(s.stability) <= 2) items.push({ kind: "LOW_STABILITY", severity: "URGENT", seasonId: s.seasonId, label: s.label, at: null });
    if (s.slot === null) items.push({ kind: "SLOT_EMPTY", severity: "NOTICE", seasonId: s.seasonId, label: s.label, at: null });
    if (s.fighters.some((h) => h > 0 && h < 60)) items.push({ kind: "FIGHTER_DAMAGED", severity: "NOTICE", seasonId: s.seasonId, label: s.label, at: null });
  }
  if (input.courtOfferPending) items.push({ kind: "COURT_OFFER", severity: "URGENT", seasonId: null, label: "The Court", at: null });
  if (input.petitionReady) items.push({ kind: "PETITION_READY", severity: "NOTICE", seasonId: null, label: "The Senate", at: null });
  return items.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
};
