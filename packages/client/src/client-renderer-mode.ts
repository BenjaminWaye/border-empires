const rendererMode =
  typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("renderer")?.toLowerCase() ?? "") : "";
const revealParam =
  typeof window !== "undefined" ? (new URLSearchParams(window.location.search).get("reveal")?.toLowerCase() ?? "") : "";

let true3DRendererActive = false;

export const prefersTrue3DRendererMode = rendererMode === "3d";
export const isCanvasReliefRendererMode = rendererMode === "3d-canvas";
export const rendererModeExplicitlySet = rendererMode.length > 0;
export const revealWholeMapInTrue3DMode =
  prefersTrue3DRendererMode && revealParam !== "0" && revealParam !== "false" && revealParam !== "off";
export const isTrue3DRendererActive = (): boolean => true3DRendererActive;
export const setTrue3DRendererActive = (active: boolean): void => {
  true3DRendererActive = active;
};
