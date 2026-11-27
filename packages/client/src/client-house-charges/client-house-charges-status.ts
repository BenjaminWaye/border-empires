// A kept charge's held status in words: "Held since Wed 21:29", "Lost Wed 21:40"
// or "Not held". The Charges card (client-house-charges-deck.ts) and your profile
// (client-house-charges-profile.ts) both use it, so they can never disagree about
// the same push. Playtest 2026-11-25: the card read "Held since 21:29" while the
// profile row said only "Held"/"Not held" from its own separate rule.
import type { HouseChargeView } from "@border-empires/shared";

export const formatHouseChargeWhen = (epochMs: number): string =>
  new Date(epochMs).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

export type HouseChargeHeldStatus = { kind: "held" | "lost" | "none"; text: string };

export const houseChargeHeldStatus = (
  charge: Pick<HouseChargeView, "held" | "completeSince" | "lostAt">,
  formatWhen: (epochMs: number) => string = formatHouseChargeWhen
): HouseChargeHeldStatus => {
  if (charge.held) return { kind: "held", text: `Held${charge.completeSince !== undefined ? ` since ${formatWhen(charge.completeSince)}` : ""}` };
  if (charge.lostAt !== undefined) return { kind: "lost", text: `Lost ${formatWhen(charge.lostAt)}` };
  return { kind: "none", text: "Not held" };
};
