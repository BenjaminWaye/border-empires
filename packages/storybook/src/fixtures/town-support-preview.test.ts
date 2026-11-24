import { Color, Mesh, Scene } from "three";
import { describe, expect, it } from "vitest";
import { PLOT_AMBER, PLOT_IVORY, PLOT_VERTICES } from "../../../client/src/client-town-support-plot/plot-style.js";
import { createTownSupportPreview, supportPreviewOffsets } from "./town-support-preview.js";

describe("shipped town plot previews", () => {
  it.each(["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const)("renders the actual support radius of %s without old hatch geometry", tier => {
    const scene = new Scene();
    const overlay = createTownSupportPreview(scene, supportPreviewOffsets(tier), false);
    const mesh = overlay.group.children[0];
    if (!(mesh instanceof Mesh)) throw new Error("missing plot mesh");
    const count = tier === "SETTLEMENT" ? 0 : tier === "TOWN" ? 8 : 24;
    expect(mesh.geometry.drawRange.count).toBe(count * PLOT_VERTICES.length);
    const positions = mesh.geometry.getAttribute("position");
    for (let i = 0; i < mesh.geometry.drawRange.count; i += 1) expect(positions.getY(i)).toBeCloseTo(0.012);
    overlay.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("highlights one hovered plot, leaving the rest ivory", () => {
    const overlay = createTownSupportPreview(new Scene(), supportPreviewOffsets("TOWN"), true);
    const mesh = overlay.group.children[0];
    if (!(mesh instanceof Mesh)) throw new Error("missing plot mesh");
    const colors = mesh.geometry.getAttribute("color");
    expect(colors.getY(0)).toBeCloseTo(new Color(PLOT_AMBER).g);
    expect(colors.getY(PLOT_VERTICES.length)).toBeCloseTo(new Color(PLOT_IVORY).g);
    overlay.dispose();
  });
});
