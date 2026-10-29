import type { ClientState } from "../client-state/client-state.js";
import { openTechDetailFromTileMenu } from "../client-tile-action-support/client-tech-locked-tile-action.js";

type StructureInfoActionState = Parameters<typeof openTechDetailFromTileMenu>[0] &
  Pick<ClientState, "structureInfoKey" | "crystalAbilityInfoKey">;

export interface StructureInfoActionsDeps {
  state: StructureInfoActionState;
  isMobile: () => boolean;
  renderHud: () => void;
}

/** Shared structure links, dismissal and unlock navigation in every HUD layout. */
export function bindStructureInfoActions(root: HTMLElement, deps: StructureInfoActionsDeps): void {
  const { state, renderHud } = deps;
  root.querySelectorAll<HTMLButtonElement>("[data-structure-info]").forEach(button => {
    button.onclick = () => {
      const type = button.dataset.structureInfo;
      if (!type) return;
      state.structureInfoKey = type;
      state.crystalAbilityInfoKey = "";
      renderHud();
    };
  });
  root.querySelectorAll<HTMLElement>("[data-structure-info-close]").forEach(button => {
    button.onclick = () => {
      state.structureInfoKey = "";
      renderHud();
    };
  });
  root.querySelectorAll<HTMLButtonElement>(".structure-info-modal button[data-view-tech]").forEach(button => {
    button.onclick = () => {
      const techId = button.dataset.viewTech;
      if (!techId) return;
      state.structureInfoKey = "";
      state.crystalAbilityInfoKey = "";
      openTechDetailFromTileMenu(state, techId, deps.isMobile());
      renderHud();
    };
  });
}
