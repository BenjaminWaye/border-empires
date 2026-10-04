import type { Tile } from "./client-types.js";

type AfcClientCommand =
  | { type: "REDEPLOY_AFC_MODULE"; x: number; y: number; techId: string }
  | { type: "BUILD_AFC"; x: number; y: number };

export const handleAfcTileAction = (input: {
  actionId: string;
  selected: Tile;
  sendGameMessage: (command: AfcClientCommand) => boolean;
  hideMenu: () => void;
  armAfcLanding: () => void;
}): boolean => {
  if (input.actionId.startsWith("redeploy_afc_module:")) {
    const techId = input.actionId.slice("redeploy_afc_module:".length);
    if (techId) input.sendGameMessage({ type: "REDEPLOY_AFC_MODULE", x: input.selected.x, y: input.selected.y, techId });
    input.hideMenu();
    return true;
  }
  if (input.actionId !== "build_afc") return false;
  input.armAfcLanding();
  input.hideMenu();
  return true;
};
