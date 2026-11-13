// Client half of the simulation's HOUSE_CHARGES push
// (apps/simulation/src/side-tickers/runtime-side-tickers.ts): this House's
// offered charges, which ones it keeps and whether each is held right now.
// Always a full replacement; progressive reveal is already applied by the
// simulation (a relic charge has no target until its beacon is detected).
import {
  HOUSE_CHARGE_KINDS,
  type HouseChargeKind,
  type HouseChargeRarity,
  type HouseChargeTarget,
  type HouseChargeView,
  type HouseChargesPayload
} from "@border-empires/shared";

export const createInitialHouseChargesState = () => ({
  /** `undefined` until the first HOUSE_CHARGES arrives (the House has not been dealt yet). */
  houseCharges: undefined as HouseChargesPayload | undefined,
  /** Charges ticked in the panel's keep choice but not yet saved. */
  houseChargesDraftKeep: undefined as string[] | undefined
});

type HouseChargesState = ReturnType<typeof createInitialHouseChargesState>;

const RARITIES: readonly HouseChargeRarity[] = ["COMMON", "RARE", "MYTHIC"];

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

const parseTarget = (value: unknown): HouseChargeTarget | undefined => {
  if (!isRecord(value) || typeof value.key !== "string" || typeof value.name !== "string" || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return undefined;
  return { key: value.key, name: value.name, x: value.x, y: value.y };
};

const parseCharge = (value: unknown): HouseChargeView | undefined => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return undefined;
  const kind = HOUSE_CHARGE_KINDS.find((entry) => entry === value.kind) as HouseChargeKind | undefined;
  const rarity = RARITIES.find((entry) => entry === value.rarity);
  const circle = value.searchCircle;
  if (!kind || !rarity || !isRecord(circle) || !isFiniteNumber(circle.x) || !isFiniteNumber(circle.y) || !isFiniteNumber(circle.radius)) return undefined;
  const targets = Array.isArray(value.targets) ? value.targets.map(parseTarget).filter((target): target is HouseChargeTarget => Boolean(target)) : [];
  return {
    id: value.id,
    kind,
    title: value.title,
    rarity,
    renown: isFiniteNumber(value.renown) ? value.renown : 1,
    kept: value.kept === true,
    held: value.held === true,
    ...(isFiniteNumber(value.completeSince) ? { completeSince: value.completeSince } : {}),
    size: isFiniteNumber(value.size) ? value.size : 0,
    searchCircle: { x: circle.x, y: circle.y, radius: circle.radius },
    targets,
    ...(typeof value.startTier === "string" ? { startTier: value.startTier } : {}),
    ...(typeof value.relicType === "string" ? { relicType: value.relicType } : {}),
    ...(isFiniteNumber(value.areaTiles) ? { areaTiles: value.areaTiles } : {})
  };
};

/** Applies one HOUSE_CHARGES message. Returns false (state untouched) for a malformed payload. */
export const applyHouseChargesMessage = (state: HouseChargesState, msg: Record<string, unknown>): boolean => {
  if (!Array.isArray(msg.charges) || !isFiniteNumber(msg.dealtAt) || !isFiniteNumber(msg.choiceClosesAt)) return false;
  const charges = msg.charges.map(parseCharge).filter((charge): charge is HouseChargeView => Boolean(charge));
  state.houseCharges = { type: "HOUSE_CHARGES", dealtAt: msg.dealtAt, choiceClosesAt: msg.choiceClosesAt, charges };
  // A pushed list is the server's word on what is kept; a draft that already matches it is done.
  const kept = charges.filter((charge) => charge.kept).map((charge) => charge.id).sort().join("|");
  if (state.houseChargesDraftKeep && [...state.houseChargesDraftKeep].sort().join("|") === kept) state.houseChargesDraftKeep = undefined;
  return true;
};
