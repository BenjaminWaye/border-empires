// Rebuild the food-tile assets from their untouched Blender exports.
// Offline ambient occlusion keeps crevice/contact shading out of the frame loop.
// Run: node scripts/bake-food-tile-models.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { addFoodTileDetail } from "./food-tile-detail.mjs";

const require = createRequire(new URL("../packages/client/package.json", import.meta.url));
const three = await import(pathToFileURL(require.resolve("three")));
const { GLTFLoader } = await import(pathToFileURL(require.resolve("three/examples/jsm/loaders/GLTFLoader.js")));
const { mergeGeometries } = await import(pathToFileURL(require.resolve("three/examples/jsm/utils/BufferGeometryUtils.js")));
const { BufferAttribute, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } = three;

function writeGlb(geometry, destination) {
  const chunks = [];
  const accessors = [];
  const bufferViews = [];
  let byteLength = 0;
  for (const name of ["position", "normal", "color", "uv"]) {
    const attribute = geometry.getAttribute(name);
    const bytes = Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target: 34962 });
    const accessor = { bufferView: accessors.length, componentType: 5126, count: attribute.count, type: name === "uv" ? "VEC2" : "VEC3" };
    if (name === "position") {
      geometry.computeBoundingBox();
      accessor.min = geometry.boundingBox.min.toArray();
      accessor.max = geometry.boundingBox.max.toArray();
    }
    accessors.push(accessor);
    chunks.push(bytes);
    byteLength += bytes.length;
  }
  const json = {
    asset: { version: "2.0", generator: "Border Empires offline food-tile AO bake" },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, TEXCOORD_0: 3 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.88 } }],
    buffers: [{ byteLength }], bufferViews, accessors
  };
  const encoded = Buffer.from(JSON.stringify(json));
  const jsonBytes = Buffer.concat([encoded, Buffer.alloc((4 - encoded.length % 4) % 4, 32)]);
  const bin = Buffer.concat(chunks);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonBytes.length + bin.length, 8);
  header.writeUInt32LE(jsonBytes.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  writeFileSync(destination, Buffer.concat([header, jsonBytes, binHeader, bin]));
}

for (const [source, target] of [["farmland", "farmland-detailed"], ["fishing2", "fishing-detailed"]]) {
  const bytes = readFileSync(new URL(`../packages/client/public/models/${source}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), "");
  gltf.scene.updateMatrixWorld(true);
  const parts = [];
  gltf.scene.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const transformed = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    const part = transformed.index ? transformed.toNonIndexed() : transformed;
    if (part !== transformed) transformed.dispose();
    for (const name of Object.keys(part.attributes)) if (name !== "position" && name !== "normal") part.deleteAttribute(name);
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    // Muted harvest gold and weathered coastal finishes keep tiny props from
    // reading as bright plastic against the production terrain palette.
    const palette = source === "farmland"
      ? { e7c514: "#b4a15d", e74a32: "#986a51", "7c7c7c": "#87948f", "02790d": "#596d45" }
      : { "867f93": "#76847f", "575b6e": "#394f54", e67960: "#977c60", e6bb60: "#c6ad62" };
    const color = palette[material.color.getHexString()] ? new three.Color(palette[material.color.getHexString()]) : material.color;
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    part.setAttribute("color", new BufferAttribute(colors, 3));
    parts.push(part);
  });
  addFoodTileDetail(three, parts, source);
  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingBox();
  const extent = geometry.boundingBox.getSize(new Vector3());
  const reach = Math.max(extent.x, extent.z) * 0.18;
  const occluderMaterial = new MeshBasicMaterial({ side: DoubleSide });
  // Per-prop bounds reject most rays before triangle intersection, which is
  // much cheaper than raycasting the entire merged field for every sample.
  const occluders = parts.map((part) => {
    part.computeBoundingBox();
    const mesh = new Mesh(part, occluderMaterial);
    mesh.updateMatrixWorld();
    return mesh;
  });
  const ray = new Raycaster();
  ray.far = reach;
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const colors = geometry.getAttribute("color");
  const uv = new Float32Array(position.count * 2);
  const point = new Vector3(), n = new Vector3(), tangent = new Vector3(), bitangent = new Vector3(), direction = new Vector3();
  // Shared positions/normals occur across triangles; reuse their exact bake.
  const baked = new Map();
  for (let i = 0; i < position.count; i += 1) {
    point.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i).normalize();
    // Box-projected, tile-scale UVs avoid stretched grain on vertical props.
    const axis = Math.abs(n.y) > 0.6 ? "y" : Math.abs(n.x) > Math.abs(n.z) ? "x" : "z";
    uv[i * 2] = axis === "x" ? point.z : point.x;
    uv[i * 2 + 1] = axis === "y" ? point.z : point.y;
    const key = [...point.toArray(), ...n.toArray()].map((v) => v.toFixed(5)).join(",");
    let shade = baked.get(key);
    if (shade === undefined) {
      tangent.set(Math.abs(n.y) < 0.9 ? 0 : 1, Math.abs(n.y) < 0.9 ? 1 : 0, 0).cross(n).normalize();
      bitangent.crossVectors(n, tangent);
      point.addScaledVector(n, reach * 0.003);
      let blocked = 0;
      const samples = 24;
      for (let sample = 0; sample < samples; sample += 1) {
        const radius = Math.sqrt((sample + 0.5) / samples);
        const angle = sample * 2.399963229728653;
        direction.copy(n).multiplyScalar(Math.sqrt(1 - radius * radius))
          .addScaledVector(tangent, radius * Math.cos(angle)).addScaledVector(bitangent, radius * Math.sin(angle));
        ray.set(point, direction);
        const hit = ray.intersectObjects(occluders, false)[0];
        if (hit) blocked += 1 - hit.distance / reach;
      }
      shade = 1 - 0.58 * blocked / samples;
      baked.set(key, shade);
    }
    colors.setXYZ(i, colors.getX(i) * shade, colors.getY(i) * shade, colors.getZ(i) * shade);
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  writeGlb(geometry, new URL(`../packages/client/public/models/${target}.glb`, import.meta.url));
  console.log(`${target}: ${position.count / 3} triangles, ${baked.size} AO samples`);
  geometry.dispose();
  for (const part of parts) part.dispose();
  occluderMaterial.dispose();
}
