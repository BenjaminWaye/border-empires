import { initClientDom } from "./client-dom.js";
import type { ClientState } from "./client-state.js";
import { techCurrentModsHtml } from "./client-tech-html.js";

export type ClientAppDom = ReturnType<typeof initClientDom>;

const toggleExpandedModKey = (
  state: ClientState,
  dom: Pick<ClientAppDom, "techCurrentModsEl" | "mobileTechCurrentModsEl">,
  modKey: "attack" | "defense" | "income" | "vision"
): void => {
  state.expandedModKey = state.expandedModKey === modKey ? null : modKey;
  const modsHtml = techCurrentModsHtml(state.mods, state.expandedModKey, state.modBreakdown);
  dom.techCurrentModsEl.innerHTML = modsHtml;
  dom.mobileTechCurrentModsEl.innerHTML = modsHtml;
};

const bindTechModChipClick = (state: ClientState, dom: Pick<ClientAppDom, "techCurrentModsEl" | "mobileTechCurrentModsEl">): void => {
  const handleTechModChipClick = (ev: Event): void => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest<HTMLElement>("[data-mod-chip]");
    if (!button) return;
    const modKey = button.dataset.modChip;
    if (modKey === "attack" || modKey === "defense" || modKey === "income" || modKey === "vision") {
      toggleExpandedModKey(state, dom, modKey);
    }
  };

  dom.techCurrentModsEl.addEventListener("click", handleTechModChipClick);
  dom.mobileTechCurrentModsEl.addEventListener("click", handleTechModChipClick);
};

export const createClientAppRuntimeDom = (state: ClientState): { dom: ClientAppDom; miniMapReplayEl: HTMLDivElement } => {
  const dom = initClientDom();
  const miniMapReplayEl = document.createElement("div");
  miniMapReplayEl.id = "mini-map-replay";
  dom.miniMapWrapEl.appendChild(miniMapReplayEl);
  bindTechModChipClick(state, dom);
  return { dom, miniMapReplayEl };
};
