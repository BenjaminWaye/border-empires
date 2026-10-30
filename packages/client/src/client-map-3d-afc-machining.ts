import { BufferGeometry, Color, Float32BufferAttribute, ExtrudeGeometry, LatheGeometry, Shape, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** Narrow machined bevels catch light without softening the angular silhouette. */
export const afcBeveledBox = (width: number, height: number, depth: number): BufferGeometry => {
  const bevel = Math.min(0.008, Math.min(width, height, depth) * 0.14);
  // RoundedBoxGeometry is non-indexed; the finish batches use indexed primitives.
  // Welding isn't needed: separate face normals keep these tiny bevels crisp.
  const geometry = new RoundedBoxGeometry(width, height, depth, 1, bevel);
  geometry.setIndex(Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i));
  return geometry;
};

/** A turned casing with a chamfer at each end, retaining the original envelope. */
export const afcTurnedCasing = (top: number, bottom: number, height: number): BufferGeometry => {
  const bevel = Math.min(0.012, height * 0.12);
  const profile = [
    new Vector2(0, -height / 2),
    new Vector2(bottom - bevel, -height / 2),
    new Vector2(bottom, -height / 2 + bevel),
    new Vector2(top, height / 2 - bevel),
    new Vector2(top - bevel, height / 2),
    new Vector2(0, height / 2)
  ];
  return new LatheGeometry(profile, 48);
};

export const colorAfcGeometry = (geometry: BufferGeometry, hex: string): BufferGeometry => {
  const color = new Color(hex);
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
};

/** Clipped shoulders and a pointed lower edge make layered armour readable. */
export const afcFacetedPlate = (width: number, length: number, depth: number): BufferGeometry => {
  const profile = new Shape();
  profile.moveTo(-width * 0.34, -length / 2);
  profile.lineTo(width * 0.34, -length / 2);
  profile.lineTo(width / 2, -length * 0.35);
  profile.lineTo(width / 2, length * 0.30);
  profile.lineTo(width * 0.18, length / 2);
  profile.lineTo(-width * 0.30, length * 0.43);
  profile.lineTo(-width / 2, length * 0.22);
  profile.lineTo(-width / 2, -length * 0.35);
  profile.closePath();
  const geometry = new ExtrudeGeometry(profile, { depth, steps: 1, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  geometry.translate(0, 0, -depth / 2);
  geometry.setIndex(Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i));
  return colorAfcGeometry(geometry, "#70848e");
};
