import { AFC_MODULE_SLOTS } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type AfcState = NonNullable<Tile["afc"]>;
type SlotState = Pick<ClientState, "tiles" | "me">;
type PushFeed = (message: string, type: string, severity: string) => void;

/** Slots an AFC has spoken for: docked modules plus copies in transit (mirrors afcSlotsUsed in the simulation). */
export const afcSlotsUsed = (afc: AfcState): number => (afc.modules?.length ?? 0) + (afc.incomingModules?.length ?? 0);
export const afcIsFull = (afc: AfcState): boolean => afcSlotsUsed(afc) >= AFC_MODULE_SLOTS;

const ownedAfcs = (state: SlotState): AfcState[] => {
  const afcs: AfcState[] = [];
  for (const tile of state.tiles.values()) if (tile.afc && tile.afc.ownerId === state.me && tile.ownerId === state.me) afcs.push(tile.afc);
  return afcs;
};

/**
 * True when a researched module has nowhere to dock: no owned AFC holds it or
 * has it incoming, and every owned AFC is full. Correct whichever arrives
 * first -- the tech update or the tile delta that docks the module -- since
 * the server only leaves a copy waiting when no AFC had a free slot.
 */
export const isAfcModuleWaitingForSlot = (state: SlotState, techId: string): boolean => {
  const afcs = ownedAfcs(state);
  if (afcs.length === 0) return false;
  const held = afcs.some((afc) => afc.modules?.includes(techId) || afc.houseModules?.includes(techId) || afc.incomingModules?.some((entry) => entry.techId === techId));
  return !held && afcs.every(afcIsFull);
};

export const afcModuleWaitingMessage = (moduleName: string): string =>
  `${moduleName} is waiting: all your AFCs are full (${AFC_MODULE_SLOTS} modules each). Build another AFC to install it.`;

export const AFC_NO_LANDING_SITE_MESSAGE =
  "Your last AFC was lost and there is no valid landing site for a new one. Free up an empty tile in your territory to receive it.";

/** True when the viewer still holds territory but owns no AFC. */
export const holdsTerritoryWithoutAfc = (state: SlotState): boolean => {
  if (!state.me) return false;
  let ownsTile = false;
  for (const tile of state.tiles.values()) {
    if (tile.ownerId !== state.me) continue;
    if (tile.afc?.ownerId === state.me) return false;
    ownsTile = true;
  }
  return ownsTile;
};

// The server grants the replacement AFC in the same combat resolution, but its
// tile delta can arrive in a later batch than the capture -- so wait briefly
// before deciding there was no landing site.
export const AFC_NO_SITE_CHECK_DELAY_MS = 3_000;

/** After the viewer loses an AFC, warns once if no replacement has landed by the time the check runs. */
export const scheduleAfcNoLandingSiteCheck = (
  state: SlotState,
  pushFeed: PushFeed,
  schedule: (task: () => void, delayMs: number) => unknown = (task, delayMs) => setTimeout(task, delayMs)
): void => {
  schedule(() => {
    if (holdsTerritoryWithoutAfc(state)) pushFeed(AFC_NO_LANDING_SITE_MESSAGE, "combat", "warn");
  }, AFC_NO_SITE_CHECK_DELAY_MS);
};
