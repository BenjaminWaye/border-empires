import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { createRelayReceiverPetal } from "../client-map-3d-relay-receiver.js";

describe("orbital receiver surface", () => {
  it("keeps reflections continuous across the curved front surface", () => {
    const geometry = createRelayReceiverPetal();
    const position = geometry.getAttribute("position"), normal = geometry.getAttribute("normal");
    let checked = 0;
    for (let triangle = 0; triangle < position.count; triangle += 3) {
      const front = [0, 1, 2].every(offset => {
        const i = triangle + offset, radius = Math.hypot(position.getX(i), position.getZ(i));
        return Math.abs(position.getY(i) - 0.20 * (radius / 0.36) ** 2) < 0.000001;
      });
      if (!front) continue;
      for (let i = triangle; i < triangle + 3; i++) {
        const expected = new Vector3(-0.40 * position.getX(i) / 0.36 ** 2, 1, -0.40 * position.getZ(i) / 0.36 ** 2).normalize();
        const actual = new Vector3().fromBufferAttribute(normal, i);
        expect(actual.dot(expected)).toBeGreaterThan(0.999999);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
    geometry.dispose();
  });

  it("has a closed backing and no unmatched shell edges", () => {
    const geometry = createRelayReceiverPetal(), position = geometry.getAttribute("position");
    const edges = new Map<string, number>();
    const vertex = (i: number): string => [position.getX(i), position.getY(i), position.getZ(i)].map(value => value.toFixed(6)).join(",");
    for (let i = 0; i < position.count; i += 3) {
      for (const [a, b] of [[i, i + 1], [i + 1, i + 2], [i + 2, i]]) {
        const key = [vertex(a!), vertex(b!)].sort().join("/");
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    expect([...edges.values()].every(count => count === 2)).toBe(true);
    geometry.dispose();
  });
});
