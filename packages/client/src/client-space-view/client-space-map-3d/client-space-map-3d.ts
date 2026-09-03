// Main Space View 3D scene assembler. Owns the renderer, scene graph,
// render loop, resize handling, and disposal — mirroring the lifecycle shape
// of createClientThreeTerrainRenderer in client-map-3d/client-map-3d.ts, but
// this is a wholly separate scene graph (a galaxy of planet nodes, not a
// tile heightfield): no code or state is shared with the tile-map renderer.
import { AmbientLight, Color, DirectionalLight, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { createStarfield, type Starfield } from "./client-space-starfield.js";
import { createSpaceCameraRig, type SpaceCameraRig } from "./client-space-camera.js";
import { createPlanetMesh, disposePlanetMesh, animatePlanetMesh, type PlanetMeshEntry } from "./client-space-planet-mesh.js";
import { createClickTracker, createSpacePointerPick } from "./client-space-pointer-pick.js";
import { createSpaceBloomPipeline, type SpaceBloomPipeline } from "./client-space-bloom.js";
import { galaxyLayoutPosition, type SpacePlanetViewModel } from "../client-space-view-state.js";

export type SpaceSceneDeps = {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  // Real seam, not a TODO: clicking a planet with an active linked Sector
  // campaign calls this with its seasonId. Wiring the actual season-switch
  // machinery is deferred — see the PR description's "deferred" list.
  onEnterSeason: (seasonId: string) => void;
  // Bloom is attempted by default but can be disabled (perf fallback / test
  // environments without a real WebGL context).
  enableBloom?: boolean;
};

export type SpaceScene = {
  setPlanets: (planets: ReadonlyArray<SpacePlanetViewModel>) => void;
  resize: () => void;
  dispose: () => void;
};

export const createSpaceScene = (deps: SpaceSceneDeps): SpaceScene => {
  const { container, canvas } = deps;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  scene.background = new Color(0x030712);

  const width = () => Math.max(1, container.clientWidth);
  const height = () => Math.max(1, container.clientHeight);
  renderer.setSize(width(), height());

  const cameraRig: SpaceCameraRig = createSpaceCameraRig(canvas, width() / height());

  scene.add(new AmbientLight(0x404060, 1.2));
  const keyLight = new DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(60, 80, 40);
  scene.add(keyLight);

  const starfield: Starfield = createStarfield();
  scene.add(starfield.group);

  const planetsGroup = new Object3D();
  scene.add(planetsGroup);

  let planetEntries: PlanetMeshEntry[] = [];
  const pointerPick = createSpacePointerPick(cameraRig.camera);

  let bloom: SpaceBloomPipeline | undefined;
  let bloomFailed = false;
  const enableBloom = deps.enableBloom ?? true;
  if (enableBloom) {
    try {
      bloom = createSpaceBloomPipeline(renderer, scene, cameraRig.camera, width(), height());
    } catch {
      // Bloom is a "nice to have" per the task spec — if it fails to
      // initialize (e.g. limited WebGL context), fall back to a plain
      // render() rather than breaking the whole screen.
      bloomFailed = true;
    }
  }

  const setPlanets = (planets: ReadonlyArray<SpacePlanetViewModel>): void => {
    for (const entry of planetEntries) {
      planetsGroup.remove(entry.group);
      disposePlanetMesh(entry);
    }
    planetEntries = planets.map((planet) => {
      const position = galaxyLayoutPosition(planet.seasonId);
      const entry = createPlanetMesh(planet.seasonId, planet.state, position);
      planetsGroup.add(entry.group);
      return entry;
    });
  };

  // See createClickTracker's doc comment: OrbitControls shares this canvas,
  // so picking needs to distinguish a genuine click from a drag-to-orbit
  // gesture (and ignore right-clicks) rather than firing on every native
  // "click" event.
  const clickTracker = createClickTracker();
  const handlePointerDown = (event: PointerEvent): void => {
    clickTracker.onPointerDown(event.button, event.clientX, event.clientY);
  };
  const handlePointerUp = (event: PointerEvent): void => {
    if (!clickTracker.onPointerUp(event.button, event.clientX, event.clientY)) return;
    const rect = canvas.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const seasonId = pointerPick.pickSeasonIdAt(offsetX, offsetY, canvas, [planetsGroup]);
    if (seasonId) deps.onEnterSeason(seasonId);
  };
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);

  const clock = { start: performance.now() };
  let animationFrame = 0;
  const animate = (): void => {
    animationFrame = requestAnimationFrame(animate);
    const elapsedSeconds = (performance.now() - clock.start) / 1000;
    for (const entry of planetEntries) animatePlanetMesh(entry, elapsedSeconds);
    cameraRig.controls.update();
    if (bloom && !bloomFailed) {
      bloom.render();
    } else {
      renderer.render(scene, cameraRig.camera);
    }
  };
  animate();

  const resize = (): void => {
    const w = width();
    const h = height();
    cameraRig.camera.aspect = w / h;
    cameraRig.camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    bloom?.setSize(w, h);
  };

  return {
    setPlanets,
    resize,
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      for (const entry of planetEntries) disposePlanetMesh(entry);
      starfield.dispose();
      cameraRig.dispose();
      bloom?.dispose();
      renderer.dispose();
    }
  };
};
