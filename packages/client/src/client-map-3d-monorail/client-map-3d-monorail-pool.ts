import { Color, InstancedMesh, Matrix4, Quaternion, Vector3, type BufferGeometry, type Material, type Scene } from "three";

// A growable InstancedMesh for the monorail. Pieces are staged into a plain
// array during a fill, then copied into the mesh once at `end()`, growing it to
// the next power of two when needed -- so the overlay never has to size for
// the worst case up front, and never loses a fill by growing mid-way.
export type MonorailPool = {
  readonly begin: () => void;
  // Box/cylinder of unit size stretched between a and b, `up` keeps the roll.
  readonly span: (a: Vector3, b: Vector3, width: number, height: number, up?: Vector3) => void;
  // Unit geometry at pos with an explicit basis (x = forward, y = up).
  readonly place: (pos: Vector3, forward: Vector3, up: Vector3, sx: number, sy: number, sz: number) => void;
  readonly upright: (pos: Vector3, sx: number, sy: number, sz: number) => void;
  readonly color: (color: Color) => void;
  readonly end: () => void;
  readonly count: () => number;
  readonly dispose: () => void;
};

const WORLD_UP = new Vector3(0, 1, 0);
const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), scratch = new Color();
const fx = new Vector3(), fy = new Vector3(), fz = new Vector3(), mid = new Vector3();

export const createMonorailPool = (
  scene: Scene,
  geometry: BufferGeometry,
  material: Material,
  opts: { readonly colored?: boolean; readonly renderOrder?: number } = {}
): MonorailPool => {
  let mesh: InstancedMesh | undefined;
  let capacity = 0;
  let matrices = new Float32Array(16 * 64);
  const colors: number[] = [];
  let n = 0;

  const ensure = (count: number): InstancedMesh => {
    if (mesh && capacity >= count) return mesh;
    if (mesh) { scene.remove(mesh); mesh.dispose(); }
    capacity = 2 ** Math.ceil(Math.log2(Math.max(16, count)));
    mesh = new InstancedMesh(geometry, material, capacity);
    mesh.frustumCulled = false;
    if (opts.renderOrder !== undefined) mesh.renderOrder = opts.renderOrder;
    // Per-instance colours must exist before the first draw, or the compiled
    // shader never reads them.
    if (opts.colored) for (let i = 0; i < capacity; i += 1) mesh.setColorAt(i, new Color(1, 1, 1));
    scene.add(mesh);
    return mesh;
  };

  const push = (): void => {
    if ((n + 1) * 16 > matrices.length) {
      const grown = new Float32Array(matrices.length * 2);
      grown.set(matrices);
      matrices = grown;
    }
    m.toArray(matrices, n * 16);
    n += 1;
  };

  const basis = (forward: Vector3, up: Vector3): void => {
    fx.copy(forward).normalize();
    fz.crossVectors(fx, up).normalize();
    if (fz.lengthSq() < 1e-6) fz.set(0, 0, 1);
    fy.crossVectors(fz, fx).normalize();
    m.makeBasis(fx, fy, fz);
  };

  return {
    begin: () => { n = 0; colors.length = 0; },
    span: (a, b, width, height, up = WORLD_UP) => {
      fx.subVectors(b, a);
      const len = fx.length();
      if (len < 1e-5) return;
      basis(fx, up);
      mid.copy(a).add(b).multiplyScalar(0.5);
      m.scale(s.set(len, height, width)).setPosition(mid);
      push();
    },
    place: (pos, forward, up, sx, sy, sz) => {
      basis(forward, up);
      m.scale(s.set(sx, sy, sz)).setPosition(pos);
      push();
    },
    upright: (pos, sx, sy, sz) => {
      m.compose(pos, q.identity(), s.set(sx, sy, sz));
      push();
    },
    color: (color) => { colors[n - 1] = color.getHex(); },
    end: () => {
      const target = ensure(n);
      (target.instanceMatrix.array as Float32Array).set(matrices.subarray(0, n * 16));
      if (opts.colored && target.instanceColor) {
        for (let i = 0; i < n; i += 1) target.setColorAt(i, scratch.setHex(colors[i] ?? 0xffffff));
        target.instanceColor.needsUpdate = true;
      }
      target.count = n;
      target.instanceMatrix.clearUpdateRanges();
      target.instanceMatrix.addUpdateRange(0, n * 16);
      target.instanceMatrix.needsUpdate = true;
    },
    count: () => n,
    dispose: () => {
      if (mesh) { scene.remove(mesh); mesh.dispose(); }
      mesh = undefined;
      capacity = 0;
    }
  };
};
