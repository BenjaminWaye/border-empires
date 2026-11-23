// A Writ of Correction names a rival House, but the simulation freezes that name when it deals the charge, and it
// only knows a guest by their account id: the card read "The Correction of House 3YpddqToNoQp5byMr6DHC5DPjKH2"
// where the player knows them as "House Noname 4" (owner 2026-11-21). The target's key carries the rival's player
// id (`house:<id>`, house-charge-dealing.ts), so the client shows the name it knows now (state.playerNames, from the
// gateway's player styles): a guest's Noname number, and their new name once they choose one.
import { houseChargeTitle, type HouseChargesPayload, type HouseChargeView } from "@border-empires/shared";

const HOUSE_KEY_PREFIX = "house:";

/** The rival House's player id on a Writ of Correction; undefined for every other charge. */
export const correctionRivalId = (charge: Pick<HouseChargeView, "kind" | "targets">): string | undefined => {
  const key = charge.kind === "CORRECTION" ? charge.targets[0]?.key : undefined;
  return key?.startsWith(HOUSE_KEY_PREFIX) ? key.slice(HOUSE_KEY_PREFIX.length) : undefined;
};

/** The charge with its rival House under the name the client knows now (title and target), else unchanged. */
export const houseChargeWithLiveName = (charge: HouseChargeView, playerNames: ReadonlyMap<string, string>): HouseChargeView => {
  const rivalId = correctionRivalId(charge);
  const live = rivalId ? playerNames.get(rivalId)?.trim() : undefined;
  const [first, ...rest] = charge.targets;
  if (!live || !first || live === first.name) return charge;
  const targets = [{ ...first, name: live }, ...rest];
  return { ...charge, targets, title: houseChargeTitle({ kind: charge.kind, targets }) };
};

/** The House's charges with every rival House under its current name. Same object when nothing changes. */
export const houseChargesWithLiveNames = <T extends HouseChargesPayload | null | undefined>(
  payload: T,
  playerNames: ReadonlyMap<string, string> | undefined
): T => {
  if (!payload || !playerNames) return payload;
  const charges = payload.charges.map((charge) => houseChargeWithLiveName(charge, playerNames));
  return charges.every((charge, index) => charge === payload.charges[index]) ? payload : { ...payload, charges };
};
