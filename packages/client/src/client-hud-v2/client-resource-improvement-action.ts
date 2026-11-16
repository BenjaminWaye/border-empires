// Resource improvements (a Mine, a Hydrogarden, the network buildings) and the
// "auto-improve" toggle under their Place button. The toggle flips that tile's
// resource in the player's server-side auto-improve switches (shared
// auto-improve-prefs.ts, carried in the auto-garrison prefs); the server then
// builds the improvement on every garrisoned tile of that resource, now and as
// more are garrisoned. The Settings card edits the same switches.
import { AUTO_SETTLE_CATEGORIES, autoImproveStructureForResource, isAutoImproveResource, structureDisplayName, type AutoImproveResource } from "@border-empires/shared";
import type { ClientAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { autoSettleCategoryLabel } from "../client-auto-settle-prompt/client-auto-settle-labels.js";

// Improvements tied to a resource deposit, rather than buildings that boost nearby tiles.
export const isResourceImprovementAction = (action: string): boolean => [
  "build_hydrogarden", "build_resin_extractor",
  "build_implant_foundry", "build_catalyst_refinery", "build_cultivation_estate", "build_reclamation_works"
].includes(action);

export type AutoImproveOption = { resource: AutoImproveResource; checked: boolean; label: string };

/** Undefined until the prefs load, and for a tile whose resource has no improvement. */
export const autoImproveOptionForTile = (autoSettle: ClientAutoSettleState | undefined, tile: { resource?: string | undefined } | undefined): AutoImproveOption | undefined => {
  if (autoSettle?.status !== "loaded" || !isAutoImproveResource(tile?.resource)) return undefined;
  const resource = tile.resource;
  return {
    resource,
    checked: autoSettle.prefs.improve[resource],
    label: `Build this on every garrisoned ${autoSettleCategoryLabel(resource).toLowerCase()} tile automatically`
  };
};

export const autoImproveOptionHtml = (option: AutoImproveOption): string =>
  `<label class="v2t-build-all"><input type="checkbox" data-auto-improve="${option.resource}" ${option.checked ? "checked" : ""} /> ${option.label}</label>`;

/** The structure a resource's auto-improve builds, for labels ("Titanium: Mine"). */
export const autoImproveStructureLabel = (resource: AutoImproveResource): string =>
  structureDisplayName(autoImproveStructureForResource(resource) ?? "");

/** One document-level listener (the build panel re-renders its HTML constantly). Idempotent per document. */
export const installAutoImproveOptionBinding = (state: { autoSettle: ClientAutoSettleState }, send: (payload: unknown) => boolean): void => {
  if (typeof document === "undefined") return;
  const doc = document as Document & { __autoImproveOptionBound?: boolean };
  if (doc.__autoImproveOptionBound) return;
  doc.__autoImproveOptionBound = true;
  document.addEventListener("change", (event) => {
    const box = event.target as HTMLInputElement | null;
    const resource = box?.matches?.("[data-auto-improve]") ? box.dataset.autoImprove : undefined;
    if (!box || !isAutoImproveResource(resource) || state.autoSettle.status !== "loaded") return;
    const current = state.autoSettle.prefs;
    const categories = Object.fromEntries(AUTO_SETTLE_CATEGORIES.map((category) => [category, current[category]]));
    const improve = { ...current.improve, [resource]: box.checked };
    if (!send({ type: "SET_AUTO_SETTLE_PREFS", ...categories, improve })) {
      box.checked = !box.checked; // not signed in yet: nothing was sent
      return;
    }
    state.autoSettle = loadedAutoSettleState({ ...current, answered: true, improve }); // optimistic; PLAYER_UPDATE confirms
  });
};
