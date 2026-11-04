import { describe, expect, it } from "vitest";
import { MeshBasicMaterial, ShaderChunk, ShaderLib } from "three";
import { attachSettledEdgeGlow } from "./client-map-3d-settled-edge-glow.js";
import { attachFrontierHatch, DEFAULT_FRONTIER_HATCH } from "./client-map-3d-frontier-hatch.js";
import { DEFAULT_SETTLED_EDGE_GLOW } from "../client-settled-edge-glow/client-settled-edge-glow.js";

// Runs a material's onBeforeCompile against three's real MeshBasicMaterial
// sources and returns the patched shaders.
const patched = (material: MeshBasicMaterial): { vertexShader: string; fragmentShader: string } => {
  const shader = { uniforms: {}, vertexShader: ShaderLib.basic.vertexShader, fragmentShader: ShaderLib.basic.fragmentShader };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
};

describe("3D settled edge glow shader patch", () => {
  it("hooks the chunks it needs in three's basic material", () => {
    expect(ShaderChunk.color_fragment).toBeDefined();
    const material = new MeshBasicMaterial();
    attachSettledEdgeGlow(material, DEFAULT_SETTLED_EDGE_GLOW);
    const { vertexShader, fragmentShader } = patched(material);
    expect(vertexShader).toContain("attribute float edgeMask;");
    expect(vertexShader).toContain("vEdgeMask = edgeMask;");
    expect(fragmentShader).toContain("float edgeBit(");
    expect(fragmentShader).toContain("smoothstep( 0.0, 1.0000, d )");
  });

  it("keeps per-vertex alpha so the shore fringe's waterline fade survives sharing the settled material", () => {
    // Regression: the patch used to assign diffuseColor.a outright, so the
    // RGBA shore fringe (no edge attributes) lost its fade and drew a flat
    // strip out to the waterline.
    const material = new MeshBasicMaterial();
    attachSettledEdgeGlow(material, DEFAULT_SETTLED_EDGE_GLOW);
    const { fragmentShader } = patched(material);
    expect(fragmentShader).toContain("diffuseColor.a = ( diffuseColor.a / opacity ) *");
    expect(fragmentShader).toContain("max( fwidth( d ), 1e-4 )");
  });

  it("frontier hatch also keeps per-vertex alpha", () => {
    const material = new MeshBasicMaterial();
    attachFrontierHatch(material, DEFAULT_FRONTIER_HATCH);
    expect(patched(material).fragmentShader).toContain("diffuseColor.a = ( diffuseColor.a / opacity ) *");
  });
});
