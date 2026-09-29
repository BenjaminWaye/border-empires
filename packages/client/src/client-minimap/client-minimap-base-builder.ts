// Builds the minimap's terrain base a few rows at a time instead of in one
// task. The full build runs worldgen for every minimap pixel (~1.5s on a
// desktop, several seconds on a phone) and used to run inside the INIT
// handler, adding straight to the post-login freeze (measured with the login
// probe — see scripts/login-experience-probe.mjs).

const SLICE_BUDGET_MS = 8;

export type MiniMapBaseBuilderDeps = {
  readonly rowCount: () => number;
  readonly buildRows: (fromRow: number, toRow: number) => void;
  readonly onComplete: () => void;
  /** Injectable for tests. */
  readonly schedule?: (callback: () => void) => void;
  readonly now?: () => number;
};

export type MiniMapBaseBuilder = {
  /** (Re)starts a build from row 0, abandoning any build in progress. */
  readonly start: () => void;
  readonly isBuilding: () => boolean;
};

const defaultSchedule = (callback: () => void): void => {
  setTimeout(callback, 0);
};

export const createMiniMapBaseBuilder = (deps: MiniMapBaseBuilderDeps): MiniMapBaseBuilder => {
  const schedule = deps.schedule ?? defaultSchedule;
  const now = deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  let generation = 0;
  let building = false;

  const runSlice = (sliceGeneration: number, fromRow: number): void => {
    if (sliceGeneration !== generation) return;
    const total = deps.rowCount();
    const sliceStartedAt = now();
    let row = fromRow;
    // Always make progress, then keep going until the slice budget is spent.
    do {
      deps.buildRows(row, row + 1);
      row += 1;
    } while (row < total && now() - sliceStartedAt < SLICE_BUDGET_MS);
    if (row < total) {
      schedule(() => runSlice(sliceGeneration, row));
      return;
    }
    building = false;
    deps.onComplete();
  };

  return {
    start: () => {
      generation += 1;
      building = true;
      const startGeneration = generation;
      schedule(() => runSlice(startGeneration, 0));
    },
    isBuilding: () => building
  };
};
