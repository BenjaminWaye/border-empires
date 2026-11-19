import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";

type SiteState = Pick<ClientState, "me" | "tiles">;
type Send = (payload: unknown) => boolean;
let binding: { state: SiteState; send: Send } | undefined;

export const installWaystationActivation = (state: SiteState, send: Send): void => { binding = { state, send }; };

/** Same eligibility for the floating prompt and tile action; server checks it again. */
export const waystationActivationReason = (me: string, tile: Tile): string =>
  tile.fogged ? "The waystation must be visible"
    : !me || tile.ownerId !== me ? "Claim this tile to activate"
    : "";

export const waystationActions = (state: Pick<ClientState, "me">, tile: Tile): TileActionDef[] => {
  if (!tile.waystation || tile.waystation.activated || tile.fogged) return [];
  const reason = waystationActivationReason(state.me, tile);
  return [{ id: "activate_waystation", label: "Activate", detail: "Unlock the crates and collect one random waystation reward. The cache is beamed away afterwards.",
    disabled: Boolean(reason), ...(reason ? { disabledReason: reason } : { recommended: true }) }];
};

/** Re-read authoritative client state when pressed; do not consume or hide the site optimistically. */
export const activateWaystationSite = (at: Pick<Tile, "x" | "y">): boolean => {
  if (!binding) return false;
  const tile = binding.state.tiles.get(`${at.x},${at.y}`);
  if (!tile?.waystation || tile.waystation.activated || waystationActivationReason(binding.state.me, tile)) return false;
  return binding.send({ type: "ACTIVATE_WAYSTATION", x: tile.x, y: tile.y });
};
