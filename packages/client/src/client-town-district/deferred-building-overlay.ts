type BuildingOverlay<Args extends readonly unknown[]> = {
  readonly addInstance: (...args: Args) => void;
  readonly clear: () => void;
  readonly commit: () => void;
  readonly update: (nowMs: number) => void;
  readonly dispose: () => void;
  readonly constructionBoundaryPassed?: () => boolean;
};
type DeferredBuildingOverlay<Args extends readonly unknown[]> = BuildingOverlay<Args> & {
  readonly constructionBoundaryPassed: () => boolean;
};

// Dedicated pre-district renderers remain available for explicit art demos,
// but their full visible-window instance buffers must not be allocated when
// the production district adapter handles every placement of that model.
export const createDeferredBuildingOverlay = <Args extends readonly unknown[]>(
  create: () => BuildingOverlay<Args>
): DeferredBuildingOverlay<Args> => {
  let overlay: BuildingOverlay<Args> | undefined;
  return {
    addInstance: (...args) => { overlay ??= create(); overlay.addInstance(...args); },
    clear: () => overlay?.clear(),
    commit: () => overlay?.commit(),
    update: nowMs => overlay?.update(nowMs),
    constructionBoundaryPassed: () => overlay?.constructionBoundaryPassed?.() ?? false,
    dispose: () => { overlay?.dispose(); overlay = undefined; }
  };
};
