// The season-end reveal (docs/house-charges-plan.md, "Rewards"): once a winner
// is crowned, every House's secret charges are published, with whether each
// was held at the crowning and for how long. Fetched once per crowned season
// from GET /hq/house-charges/season/latest and shown as the season-end
// screen's House Charges tab.
import type { HouseChargeResult, SeasonHouseChargesSnapshot } from "@border-empires/shared";
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import { HOUSE_CHARGE_KIND_LABEL } from "./client-house-charges-labels.js";

export type HouseChargeRevealView = {
  seasonId: string;
  seasonSequence: number;
  endedAt: number | null;
  winnerPlayerId: string | null;
  houses: SeasonHouseChargesSnapshot[];
};

export type HouseChargeRevealLoad = { key: string; view: HouseChargeRevealView | "loading" | "missing" };

export const createInitialHouseChargeRevealState = () => ({
  /** The reveal for the crowned season keyed by `key` (winner + crowning time); undefined until first requested. */
  houseChargeReveal: undefined as HouseChargeRevealLoad | undefined
});

const esc = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const fetchHouseChargeReveal = async (wsUrl: string): Promise<HouseChargeRevealView | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/house-charges/season/latest`, { headers: { Accept: "application/json" } });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as Partial<HouseChargeRevealView> | undefined;
    return body && Array.isArray(body.houses) && typeof body.seasonId === "string" ? (body as HouseChargeRevealView) : undefined;
  } catch {
    return undefined;
  }
};

/** Starts the fetch for the crowned season `key` once; `rerender` runs when it lands. */
export const ensureHouseChargeReveal = (
  state: { houseChargeReveal?: HouseChargeRevealLoad | undefined },
  key: string,
  wsUrl: string | undefined,
  rerender: () => void
): void => {
  if (!wsUrl || state.houseChargeReveal?.key === key) return;
  state.houseChargeReveal = { key, view: "loading" };
  void fetchHouseChargeReveal(wsUrl).then((view) => {
    if (state.houseChargeReveal?.key !== key) return;
    state.houseChargeReveal = { key, view: view ?? "missing" };
    rerender();
  });
};

const chargeRowHtml = (charge: HouseChargeResult): string =>
  `<li class="hcr-charge${charge.held ? " is-held" : ""}">
    <span class="hcr-kind">${HOUSE_CHARGE_KIND_LABEL[charge.kind]}</span>
    <span class="hcr-title">${esc(charge.title)}</span>
    <span class="hcr-result">${charge.held ? `Held · ${charge.hoursHeld} h` : "Not held"}</span>
  </li>`;

/** The House Charges tab of the season-end screen. */
export const houseChargeRevealHtml = (
  load: HouseChargeRevealLoad | undefined,
  namedPlayer: (id: string, name: string) => string,
  selfId: string | undefined
): string => {
  const view = load?.view;
  if (view === undefined || view === "loading") return `<section class="se-panel hcr"><p class="hcr-note">Unsealing every House's charges…</p></section>`;
  if (view === "missing" || view.houses.length === 0) {
    return `<section class="se-panel hcr"><p class="hcr-note">No House Charges were recorded for this Sector Contest.</p></section>`;
  }
  const heldCount = (house: SeasonHouseChargesSnapshot): number => house.charges.filter((charge) => charge.held).length;
  const houses = [...view.houses].sort((a, b) =>
    Number(b.playerId === selfId) - Number(a.playerId === selfId) || heldCount(b) - heldCount(a) || a.playerName.localeCompare(b.playerName));
  const fulfilled = view.houses.reduce((sum, house) => sum + heldCount(house), 0);
  return `<section class="se-panel hcr">
    <h3 class="se-panel-title">House Charges unsealed</h3>
    <p class="hcr-note">Every House's secret charges, and whether it still held them when the winner was crowned. ${fulfilled} charge${fulfilled === 1 ? "" : "s"} fulfilled; each became a card in its House's profile.</p>
    <ul class="hcr-houses">${houses.map((house) => `<li class="hcr-house${house.playerId === selfId ? " is-self" : ""}">
      <div class="hcr-house-name">${namedPlayer(house.playerId, house.playerName)}<span class="hcr-count">${heldCount(house)}/${house.charges.length}</span></div>
      <ul class="hcr-charges">${house.charges.map(chargeRowHtml).join("")}</ul>
    </li>`).join("")}</ul>
  </section>`;
};
