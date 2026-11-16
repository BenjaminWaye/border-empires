// The three refinery pickers (docs/territory-development-plan.md, Phase 2,
// Client), opened from the tile menu and from the "needs a field" toast:
//   - build from a town / support tile: choose the field (auto when one fits);
//   - "Refine at…" from a deposit: choose the town, then its ring tile;
//   - "Change field" on a refinery: choose a new field (ASSIGN_REFINERY_FIELD).
// While a picker is open the map highlights the reach and the fields
// (refinery-picker-highlight.ts). Installed once at bootstrap with the
// build / send plumbing, like the salvage sheet, so map toasts can open it.
import { REFINERY_FIELD_RESOURCE_BY_TYPE, refineryReachFromTownKey, refineryTileKey, structureDisplayName, type RefineryType } from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile } from "../client-types.js";
import { refineryStatusFor, refineryTilesView } from "./refinery-client-status.js";
import { assignRefineryFieldPayload, refineryBuildPayload, type RefineryBuildPayload } from "./refinery-commands.js";
import { refineryFieldOptions, type RefineryFieldOption } from "./refinery-field-options.js";
import { buildRefineryHighlight, setRefineryPickerHighlight, type RefineryHighlightTone } from "./refinery-picker-highlight.js";
import { refineAtTownChoices, refineryTownName, refineryTypeForDeposit, type RefineAtTownChoice } from "./refinery-towns.js";
import { showRefineryChoiceSheet, type RefineryChoice, type RefineryChoiceSheetOptions } from "./refinery-choice-sheet.js";

export type RefineryPickerDeps = {
  readonly state: { readonly tiles: ReadonlyMap<string, Tile>; readonly tilesRevision: number; readonly me: string };
  /** Sends (or queues) the refinery build through the development queue. */
  readonly buildRefinery: (payload: RefineryBuildPayload, label: string) => boolean;
  readonly sendGameMessage: (payload: unknown, message?: string) => boolean;
  /** Overridable for tests; defaults to the DOM sheet. */
  readonly showSheet?: (sheet: RefineryChoiceSheetOptions) => boolean;
};

let wired: RefineryPickerDeps | undefined;

/** Called once at bootstrap so the tile menu and the map toasts can open the pickers. */
export const installRefineryPickers = (deps: RefineryPickerDeps): void => { wired = deps; };

const keyOf = (tile: { x: number; y: number }): string => refineryTileKey(tile.x, tile.y);

const slotText = (slots: number): string => `+${slots} slot${slots === 1 ? "" : "s"}`;

/** "+4 slots" now, and what a fully garrisoned field would give when that is more. */
export const fieldGainText = (option: RefineryFieldOption): string =>
  option.fullSlotGain > option.slotGain ? `${slotText(option.slotGain)} now · ${slotText(option.fullSlotGain)} garrisoned` : slotText(option.slotGain);

export const fieldChoice = (option: RefineryFieldOption, current = false): RefineryChoice => ({
  label: `${current ? "Current field" : "Field"} at (${option.anchorX}, ${option.anchorY})`,
  stat: fieldGainText(option),
  detail: `${option.tileCount} tile${option.tileCount === 1 ? "" : "s"} · ${option.garrisoned} garrisoned · +${option.perTileSlots} per garrisoned tile · ${option.distance} land tiles from the town`,
  disabled: option.status !== "eligible",
  ...(option.reason ? { reason: option.reason } : {})
});

const fieldHighlight = (deps: RefineryPickerDeps, townKey: string, options: readonly RefineryFieldOption[], focused?: RefineryFieldOption): void => {
  const reach = refineryReachFromTownKey(refineryTilesView(deps.state.tiles), deps.state.me, townKey).keys();
  const layers: Array<{ keys: Iterable<string>; tone: RefineryHighlightTone }> = [{ keys: reach, tone: "reach" }];
  for (const option of options) layers.push({ keys: option.tileKeys, tone: option.status });
  if (focused) layers.push({ keys: focused.tileKeys, tone: "focus" });
  setRefineryPickerHighlight(buildRefineryHighlight(layers));
};

const fieldSheet = (
  deps: RefineryPickerDeps, title: string, subtitle: string, townKey: string, options: readonly RefineryFieldOption[],
  onPick: (option: RefineryFieldOption) => void, currentFieldId?: string
): boolean => {
  fieldHighlight(deps, townKey, options);
  const shown = (deps.showSheet ?? showRefineryChoiceSheet)({
    title, subtitle,
    choices: options.map((option) => fieldChoice(option, option.fieldId === currentFieldId)),
    onPick: (index) => { const option = options[index]; if (option) onPick(option); },
    onFocus: (index) => fieldHighlight(deps, townKey, options, index === undefined ? undefined : options[index]),
    onClose: () => setRefineryPickerHighlight(undefined)
  });
  if (!shown) setRefineryPickerHighlight(undefined);
  return shown;
};

/** The town a refinery built from this tile would serve: the tile itself when it is a town, else the ring it sits on. */
export const refineryTownForBuildSite = (tiles: ReadonlyMap<string, Tile>, me: string, site: Tile): Tile | undefined =>
  site.town ? site : assignedTownForSupportTile(tiles, site, me);

/**
 * Build a refinery from a town or support tile: lists the town's fields, and
 * builds straight away when exactly one is eligible. False when nothing
 * could be shown or sent.
 */
export const openRefineryBuildPicker = (type: RefineryType, site: Tile, deps: RefineryPickerDeps | undefined = wired): boolean => {
  if (!deps) return false;
  const town = refineryTownForBuildSite(deps.state.tiles, deps.state.me, site);
  if (!town) return false;
  const townKey = keyOf(town);
  const options = refineryFieldOptions(deps.state.tiles, deps.state.me, type, townKey);
  const eligible = options.filter((option) => option.status === "eligible");
  const name = structureDisplayName(type);
  const build = (option: RefineryFieldOption): boolean =>
    deps.buildRefinery(refineryBuildPayload(type, site, { x: option.anchorX, y: option.anchorY }), `${name} at (${site.x}, ${site.y})`);
  if (eligible.length === 1) return build(eligible[0]!);
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[type].toLowerCase();
  return fieldSheet(deps, `Choose a field for the ${name}`, `${refineryTownName(town)}: ${resource} fields within reach`, townKey, options, (option) => { build(option); });
};

/** "Change field" (and the broken-link toast): reassign the refinery on `tile`. */
export const openRefineryChangeFieldPicker = (tile: Tile, deps: RefineryPickerDeps | undefined = wired): boolean => {
  if (!deps) return false;
  const status = refineryStatusFor(deps.state, tile);
  const record = tile.economicStructure;
  if (!status || !record || record.ownerId !== deps.state.me) return false;
  const town = status.townKey ? deps.state.tiles.get(status.townKey) : refineryTownForBuildSite(deps.state.tiles, deps.state.me, tile);
  if (!town) return false;
  const townKey = keyOf(town);
  const options = refineryFieldOptions(deps.state.tiles, deps.state.me, status.type, townKey, keyOf(tile));
  const assign = (option: RefineryFieldOption): boolean =>
    deps.sendGameMessage(assignRefineryFieldPayload(tile, { x: option.anchorX, y: option.anchorY }), "Finish sign-in before changing a refinery's field.");
  const eligible = options.filter((option) => option.status === "eligible");
  if (eligible.length === 1 && eligible[0]!.fieldId !== status.fieldId) return assign(eligible[0]!);
  const name = structureDisplayName(status.type);
  const subtitle = status.needsField === "UNLINKED" ? "The link to its field is broken. Choose a linked field." : status.needsField ? "It has no field to process. Choose one." : `${refineryTownName(town)}: choose the field it processes`;
  return fieldSheet(deps, `Change field: ${name}`, subtitle, townKey, options, (option) => { assign(option); }, status.fieldId);
};

const townChoice = (choice: RefineAtTownChoice): RefineryChoice => ({
  label: choice.townName,
  stat: fieldGainText(choice.option),
  detail: `${choice.ringTiles.length} free support tile${choice.ringTiles.length === 1 ? "" : "s"} · ${choice.option.distance} land tiles to the field · +${choice.option.perTileSlots} per garrisoned tile`,
  disabled: Boolean(choice.disabledReason),
  ...(choice.disabledReason ? { reason: choice.disabledReason } : {})
});

const siteHighlight = (choice: RefineAtTownChoice | undefined, fieldKeys: readonly string[], site?: Tile): void => {
  const layers: Array<{ keys: Iterable<string>; tone: RefineryHighlightTone }> = [{ keys: fieldKeys, tone: "focus" }];
  if (choice) layers.push({ keys: choice.ringTiles.map(keyOf), tone: "eligible" });
  const shownSite = site ?? choice?.ringTiles[0];
  if (shownSite) layers.push({ keys: [keyOf(shownSite)], tone: "site" });
  setRefineryPickerHighlight(buildRefineryHighlight(layers));
};

/** "Refine at…" from a deposit tile: choose a town, then (when it has several) the ring tile to give up. */
export const openRefineAtPicker = (deposit: Tile, deps: RefineryPickerDeps | undefined = wired): boolean => {
  const type = refineryTypeForDeposit(deposit);
  if (!deps || !type) return false;
  const choices = refineAtTownChoices(deps.state.tiles, deps.state.me, deposit);
  const show = deps.showSheet ?? showRefineryChoiceSheet;
  const name = structureDisplayName(type);
  const fieldKeys = choices[0]?.option.tileKeys ?? [keyOf(deposit)];
  const build = (choice: RefineAtTownChoice, site: Tile): boolean =>
    deps.buildRefinery(refineryBuildPayload(type, site, { x: deposit.x, y: deposit.y }), `${name} at (${site.x}, ${site.y})`);
  const chooseSite = (choice: RefineAtTownChoice): void => {
    if (choice.ringTiles.length <= 1) { if (choice.ringTiles[0]) build(choice, choice.ringTiles[0]); return; }
    siteHighlight(choice, fieldKeys);
    show({
      title: `Where in ${choice.townName}?`,
      subtitle: `The ${name} takes this support tile; nothing else can stand on it.`,
      choices: choice.ringTiles.map((tile, index) => ({
        label: `Support tile (${tile.x}, ${tile.y})`, stat: index === 0 ? "Nearest the field" : "",
        detail: tile.resource ? `Holds ${tile.resource.toLowerCase()}` : "Open garrisoned land", disabled: false
      })),
      onPick: (index) => { const site = choice.ringTiles[index]; if (site) build(choice, site); },
      onFocus: (index) => siteHighlight(choice, fieldKeys, index === undefined ? undefined : choice.ringTiles[index]),
      onClose: () => setRefineryPickerHighlight(undefined)
    });
  };
  siteHighlight(choices.find((choice) => !choice.disabledReason), fieldKeys);
  const shown = show({
    title: `Refine at… (${name})`,
    subtitle: choices.length ? "Towns that could process this field" : "None of your towns is in reach of this field",
    choices: choices.map(townChoice),
    // The second sheet replaces this one; its own close clears the highlight.
    onPick: (index) => { const choice = choices[index]; if (choice) chooseSite(choice); },
    onFocus: (index) => siteHighlight(index === undefined ? undefined : choices[index], fieldKeys),
    onClose: () => setRefineryPickerHighlight(undefined)
  });
  if (!shown) setRefineryPickerHighlight(undefined);
  return shown;
};
