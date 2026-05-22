import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";

export type Stage = {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly dispose: () => void;
};

export type StageOptions = {
  readonly width?: number;
  readonly height?: number;
  readonly cameraDistance?: number;
  readonly cameraTilt?: number;
  readonly background?: string;
};

export const createStage = (opts: StageOptions = {}): Stage => {
  const width = opts.width ?? 960;
  const height = opts.height ?? 540;
  const cameraDistance = opts.cameraDistance ?? 14;
  const cameraTilt = opts.cameraTilt ?? 0.6;

  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "auto";

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  if (opts.background !== undefined) {
    renderer.setClearColor(opts.background, 1);
  }

  const scene = new Scene();

  const camera = new PerspectiveCamera(45, width / height, 0.1, 4000);
  const horizontal = Math.sin(cameraTilt) * cameraDistance;
  const vertical = Math.cos(cameraTilt) * cameraDistance;
  camera.position.set(0, vertical, horizontal);
  camera.lookAt(0, 0, 0);

  const ambient = new AmbientLight(0xffffff, 0.55);
  const sun = new DirectionalLight(0xffffff, 0.9);
  sun.position.set(8, 14, 6);
  scene.add(ambient, sun);

  let rafId = 0;
  const tick = (): void => {
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  tick();

  const dispose = (): void => {
    cancelAnimationFrame(rafId);
    renderer.dispose();
  };

  return { canvas, scene, camera, renderer, dispose };
};

export type GridArgs = {
  readonly radius: number;
  readonly spacing: number;
};

export const forEachGridCell = (
  args: GridArgs,
  visit: (worldX: number, worldZ: number) => void
): void => {
  const { radius, spacing } = args;
  for (let dz = -radius; dz <= radius; dz += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      visit(dx * spacing, dz * spacing);
    }
  }
};

export const wrapWithCleanup = (stage: Stage, cleanups: ReadonlyArray<() => void>): HTMLElement => {
  const container = document.createElement("div");
  container.style.position = "relative";
  container.style.background = "#0a0e14";
  container.appendChild(stage.canvas);

  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      for (const fn of cleanups) {
        try { fn(); } catch { /* ignore */ }
      }
      stage.dispose();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return container;
};
