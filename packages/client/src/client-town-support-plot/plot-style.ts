// Shared footprint and colours for the 2D and true-3D town build plots.
export const PLOT_HALF = 0.4;
export const PLOT_LEG = 0.16;
export const PLOT_STROKE = 0.025;
export const PLOT_IVORY = "#f5edce";
export const PLOT_AMBER = "#ffd166";
export const PLOT_DIAMOND = "#c6a871";
export const PLOT_DIAMOND_HALF = 0.025;

export type PlotPoint = readonly [x: number, z: number];

// Triangulated, subdivided strips drape over slopes instead of making a
// rigid frame. No geometry fills the plot's interior or extends underground.
export const plotMarkerVertices = (): readonly PlotPoint[] => {
  const vertices: PlotPoint[] = [];
  const rect = (x0: number, z0: number, x1: number, z1: number): void => {
    vertices.push([x0, z0], [x0, z1], [x1, z0], [x1, z0], [x0, z1], [x1, z1]);
  };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let segment = 0; segment < 4; segment += 1) {
      const a = segment * PLOT_LEG / 4;
      const b = (segment + 1) * PLOT_LEG / 4;
      rect(sx * (PLOT_HALF - a), sz * PLOT_HALF, sx * (PLOT_HALF - b), sz * (PLOT_HALF - PLOT_STROKE));
      rect(sx * PLOT_HALF, sz * (PLOT_HALF - a), sx * (PLOT_HALF - PLOT_STROKE), sz * (PLOT_HALF - b));
    }
  }
  const d = PLOT_DIAMOND_HALF;
  vertices.push([0, -d], [-d, 0], [d, 0], [d, 0], [-d, 0], [0, d]);
  return vertices;
};

export const PLOT_VERTICES = plotMarkerVertices();
