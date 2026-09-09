// Main Space View 3D scene assembler. Owns the renderer, scene graph,
// render loop, resize handling, and disposal — mirroring the lifecycle shape
// of createClientThreeTerrainRenderer in client-map-3d/client-map-3d.ts, but
// this is a wholly separate scene graph (a galaxy of planet nodes, not a
// tile heightfield): no code or state is shared with the tile-map renderer.
import { AmbientLight, Color, DirectionalLight, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";
import { createStarfield, type Starfield } from "./client-space-starfield.js";
import { createSpaceCameraRig, FOCUS_VIEW_DISTANCE, type SpaceCameraRig } from "./client-space-camera.js";
import { createSolarSystem, disposeSolarSystem, animateSolarSystem, setSolarSystemThreat, type SolarSystemEntry } from "./client-space-solar-system.js";
import { createFleetOverlay, disposeFleetOverlay, animateFleetOverlay, type FleetOverlayEntry, type FleetOverlayOrder } from "./client-space-fleet-overlay.js";
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
  // Renders one moving formation per still-TRAVELING fleet order (see
  // client-space-fleet-overlay.ts). Callers pass only orders they want
  // shown -- a RESOLVED order or one belonging to a fleet no longer worth
  // rendering should simply be omitted from the next call.
  setFleetOrders: (orders: ReadonlyArray<FleetOverlayOrder>) => void;
  // Toggles each already-rendered system's threat ring in place (see
  // setSolarSystemThreat) -- lighter than a full setPlanets() rebuild for a
  // periodic "did anything change" poll.
  setThreats: (threatenedSeasonIds: ReadonlySet<string>) => void;
  // Flies the camera back out to the default wide galaxy view -- the
  // "zoom out" counterpart to clicking a system to fly in to it. Exposed
  // so the chrome's "Galaxy View" button can trigger it directly, in
  // addition to clicking empty space doing the same (see handlePointerUp).
  resetView: () => void;
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

  let systemEntries: SolarSystemEntry[] = [];
  const pointerPick = createSpacePointerPick(cameraRig.camera);

  const fleetsGroup = new Object3D();
  scene.add(fleetsGroup);
  let fleetEntries: FleetOverlayEntry[] = [];

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
    for (const entry of systemEntries) {
      planetsGroup.remove(entry.group);
      disposeSolarSystem(entry);
    }
    systemEntries = planets.map((planet) => {
      const position = galaxyLayoutPosition(planet.seasonId);
      const entry = createSolarSystem(planet, position);
      planetsGroup.add(entry.group);
      return entry;
    });
  };

  const setThreats = (threatenedSeasonIds: ReadonlySet<string>): void => {
    for (const entry of systemEntries) setSolarSystemThreat(entry, threatenedSeasonIds.has(entry.seasonId));
  };

  const setFleetOrders = (orders: ReadonlyArray<FleetOverlayOrder>): void => {
    const nextIds = new Set(orders.map((o) => o.id));
    for (const entry of fleetEntries) {
      if (nextIds.has(entry.id)) continue;
      fleetsGroup.remove(entry.group);
      disposeFleetOverlay(entry);
    }
    const existingById = new Map(fleetEntries.filter((e) => nextIds.has(e.id)).map((e) => [e.id, e]));
    fleetEntries = orders.map((order) => {
      const existing = existingById.get(order.id);
      if (existing) return existing;
      const entry = createFleetOverlay(order);
      fleetsGroup.add(entry.group);
      return entry;
    });
  };

  // Which system (if any) the camera is currently focused/flown-in on --
  // drives the click model below: clicking an unfocused system flies the
  // camera to it; clicking the *already*-focused one commits to entering
  // its Sector (deps.onEnterSeason); clicking empty space while focused
  // flies back out to the wide galaxy view.
  let focusedSeasonId: string | undefined;

  const resetView = (): void => {
    cameraRig.resetView();
    focusedSeasonId = undefined;
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
    if (!seasonId) {
      if (focusedSeasonId) resetView();
      return;
    }
    if (seasonId === focusedSeasonId) {
      deps.onEnterSeason(seasonId);
      return;
    }
    const entry = systemEntries.find((e) => e.seasonId === seasonId);
    if (!entry) return;
    cameraRig.flyTo(entry.group.position, FOCUS_VIEW_DISTANCE);
    focusedSeasonId = seasonId;
  };
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerup", handlePointerUp);

  const clock = { start: performance.now() };
  let animationFrame = 0;
  const animate = (): void => {
    animationFrame = requestAnimationFrame(animate);
    const elapsedSeconds = (performance.now() - clock.start) / 1000;
    for (const entry of systemEntries) animateSolarSystem(entry, elapsedSeconds);
    const nowMs = Date.now();
    for (const entry of fleetEntries) animateFleetOverlay(entry, nowMs);
    cameraRig.tick();
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
    setFleetOrders,
    setThreats,
    resetView,
    resize,
    dispose: () => {
      cancelAnimationFrame(animationFrame);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
      for (const entry of systemEntries) disposeSolarSystem(entry);
      for (const entry of fleetEntries) disposeFleetOverlay(entry);
      starfield.dispose();
      cameraRig.dispose();
      bloom?.dispose();
      renderer.dispose();
    }
  };
};
