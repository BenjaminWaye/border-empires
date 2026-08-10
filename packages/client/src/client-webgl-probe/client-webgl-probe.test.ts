// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  describeWebGLProbe,
  recordRendererFailure,
  rendererFailureSnapshot,
  resetRendererFailure,
  resetWebGLProbeCache,
  runWebGLProbe,
  webGLProbe
} from "./client-webgl-probe.js";

// Minimal stand-ins for the WebGL parameter enums the probe reads. Real values
// don't matter — the probe only ever passes them straight back to getParameter.
const GL_ENUMS = {
  VENDOR: 0x1f00,
  RENDERER: 0x1f01,
  SHADING_LANGUAGE_VERSION: 0x8b8c,
  MAX_TEXTURE_SIZE: 0x0d33,
  MAX_CUBE_MAP_TEXTURE_SIZE: 0x851c,
  MAX_RENDERBUFFER_SIZE: 0x84e8,
  MAX_TEXTURE_IMAGE_UNITS: 0x8872,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8b4c,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
  MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
  MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
  MAX_VARYING_VECTORS: 0x8dfc,
  MAX_VERTEX_ATTRIBS: 0x8869
};

type FakeGl = Record<string, unknown> & { loseContextCalls: number };

const createFakeGl = (params: Record<number, unknown>): FakeGl => {
  const gl: FakeGl = {
    ...GL_ENUMS,
    loseContextCalls: 0,
    getParameter: (name: number) => params[name],
    getExtension: (name: string) => {
      if (name === "WEBGL_lose_context") {
        return {
          loseContext: () => {
            gl.loseContextCalls += 1;
          }
        };
      }
      return null;
    }
  };
  return gl;
};

const installFakeCanvas = (contexts: Record<string, unknown>, onListen?: (type: string, handler: EventListener) => void): void => {
  const canvas = {
    width: 0,
    height: 0,
    addEventListener: (type: string, handler: EventListener) => onListen?.(type, handler),
    removeEventListener: () => undefined,
    getContext: (type: string) => contexts[type] ?? null
  };
  vi.spyOn(document, "createElement").mockImplementation(() => canvas as unknown as HTMLElement);
};

const workingParams = {
  [GL_ENUMS.VENDOR]: "WebKit",
  [GL_ENUMS.RENDERER]: "Apple GPU",
  [GL_ENUMS.MAX_TEXTURE_SIZE]: 16384,
  [GL_ENUMS.MAX_VARYING_VECTORS]: 15
};

describe("webgl probe", () => {
  beforeEach(() => {
    resetWebGLProbeCache();
    resetRendererFailure();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetWebGLProbeCache();
    resetRendererFailure();
  });

  it("reports ok and the gpu limits when webgl2 is available", () => {
    const gl = createFakeGl(workingParams);
    installFakeCanvas({ webgl2: gl });

    const probe = runWebGLProbe();

    expect(probe.ok).toBe(true);
    expect(probe.contextType).toBe("webgl2");
    expect(probe.renderer).toBe("Apple GPU");
    expect(probe.maxTextureSize).toBe(16384);
    expect(probe.failureReason).toBeUndefined();
  });

  it("releases the probe context — iOS caps live contexts per page", () => {
    const gl = createFakeGl(workingParams);
    installFakeCanvas({ webgl2: gl });

    runWebGLProbe();

    expect(gl.loseContextCalls).toBe(1);
  });

  it("flags webgl1-only devices as not ok, since three.js needs webgl2", () => {
    const gl = createFakeGl(workingParams);
    installFakeCanvas({ webgl: gl });

    const probe = runWebGLProbe();

    expect(probe.ok).toBe(false);
    expect(probe.contextType).toBe("webgl");
    expect(probe.failureReason).toContain("webgl2");
  });

  it("surfaces the browser's own context-creation error message", () => {
    installFakeCanvas({}, (type, handler) => {
      if (type !== "webglcontextcreationerror") return;
      // Safari fires this synchronously from getContext; emulate by firing it
      // as soon as the probe subscribes.
      handler({ statusMessage: "Total number of WebGL contexts exceeded maximum" } as unknown as Event);
    });

    const probe = runWebGLProbe();

    expect(probe.ok).toBe(false);
    expect(probe.contextType).toBe("none");
    expect(probe.failureReason).toBe("Total number of WebGL contexts exceeded maximum");
  });

  it("never throws when getContext blows up", () => {
    const canvas = {
      width: 0,
      height: 0,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      getContext: () => {
        throw new Error("SecurityError");
      }
    };
    vi.spyOn(document, "createElement").mockImplementation(() => canvas as unknown as HTMLElement);

    const probe = runWebGLProbe();

    expect(probe.ok).toBe(false);
    expect(probe.failureReason).toContain("SecurityError");
  });

  it("memoizes, so repeated diagnostics downloads don't burn context slots", () => {
    const gl = createFakeGl(workingParams);
    installFakeCanvas({ webgl2: gl });

    webGLProbe();
    webGLProbe();

    expect(gl.loseContextCalls).toBe(1);
  });

  it("describes a failing probe in one line a player can read off a phone", () => {
    const gl = createFakeGl(workingParams);
    installFakeCanvas({ webgl: gl });

    expect(describeWebGLProbe(runWebGLProbe())).toContain("webgl2 unavailable");
  });

  it("keeps the first renderer failure — the first cause is the real one", () => {
    recordRendererFailure("WebGL context lost: memory pressure");
    recordRendererFailure("something later and less interesting");

    expect(rendererFailureSnapshot()?.reason).toBe("WebGL context lost: memory pressure");
  });

  it("reports no failure on a healthy session", () => {
    expect(rendererFailureSnapshot()).toBeUndefined();
  });
});
