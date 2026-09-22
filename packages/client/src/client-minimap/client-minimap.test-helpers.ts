// Shared fake CanvasRenderingContext2D for client-minimap.test.ts and
// client-minimap-tiles-revision.test.ts -- split out so neither test file
// has to duplicate it as both grow.
export const makeFakeCtx = (): CanvasRenderingContext2D & {
  fillRectCalls: Array<{ x: number; y: number; w: number; h: number; style: string }>;
  arcCalls: Array<{ x: number; y: number }>;
  translateCalls: Array<{ x: number; y: number }>;
  fillStyleAtFill: string[];
} => {
  const calls: Array<{ x: number; y: number; w: number; h: number; style: string }> = [];
  const arcCalls: Array<{ x: number; y: number }> = [];
  const translateCalls: Array<{ x: number; y: number }> = [];
  const fillStyleAtFill: string[] = [];
  let fillStyle = "#000000";
  const ctx = {
    fillRectCalls: calls,
    arcCalls,
    translateCalls,
    fillStyleAtFill,
    get fillStyle(): string {
      return fillStyle;
    },
    set fillStyle(v: string) {
      fillStyle = v;
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      calls.push({ x, y, w, h, style: fillStyle });
    },
    clearRect: () => {},
    drawImage: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    arc: (x: number, y: number) => {
      arcCalls.push({ x, y });
    },
    fill: () => {
      fillStyleAtFill.push(fillStyle);
    },
    stroke: () => {},
    fillText: () => {},
    save: () => {},
    restore: () => {},
    translate: (x: number, y: number) => {
      translateCalls.push({ x, y });
    },
    rotate: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    strokeStyle: "",
    lineWidth: 1,
    textAlign: "center",
    textBaseline: "middle",
    font: "",
    imageSmoothingEnabled: false
  };
  return ctx as unknown as CanvasRenderingContext2D & {
    fillRectCalls: typeof calls;
    arcCalls: typeof arcCalls;
    translateCalls: typeof translateCalls;
    fillStyleAtFill: typeof fillStyleAtFill;
  };
};
