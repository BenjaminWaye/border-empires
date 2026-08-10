// Why this exists: the 3D renderer is a single `new WebGLRenderer(...)` call
// deep inside client-map-3d.ts. When it fails on a device we don't own (the
// reported case: Safari on an iPhone 13, where the 2D renderer works fine),
// all we get is a `console.error` nobody can read — phones have no visible
// console. This probe collects the handful of facts that actually
// discriminate between the plausible causes, cheaply and before three.js is
// touched, so they can be shown on-screen and folded into the downloadable
// diagnostics bundle.
//
// The discriminating facts, and what each one tells us:
//   - `contextType`: three.js r163+ is WebGL2-only. A device that gives us a
//     `webgl` context but not `webgl2` fails 3D while 2D canvas keeps working
//     — exactly the reported symptom.
//   - `failureReason`: Safari fires `webglcontextcreationerror` with a real
//     message ("Web page caused context loss and was blocked", "Total number
//     of WebGL contexts exceeded maximum") that names the cause outright.
//   - the MAX_* limits: iOS reports much smaller limits than desktop, so a
//     shader or texture that fits everywhere else can fail to link there.
//
// Deliberately non-destructive: the probe context is released via
// WEBGL_lose_context as soon as it has been read, because iOS Safari caps the
// number of simultaneous WebGL contexts per page and leaking this one would
// itself break the real renderer.

export type WebGLProbe = {
  /** True when a context three.js can actually use (webgl2) was created. */
  readonly ok: boolean;
  readonly contextType: "webgl2" | "webgl" | "none";
  /** Message from `webglcontextcreationerror`, when the browser gave one. */
  readonly failureReason?: string | undefined;
  readonly vendor?: string | undefined;
  readonly renderer?: string | undefined;
  readonly shadingLanguageVersion?: string | undefined;
  readonly maxTextureSize?: number | undefined;
  readonly maxCubeMapTextureSize?: number | undefined;
  readonly maxRenderbufferSize?: number | undefined;
  readonly maxTextureImageUnits?: number | undefined;
  readonly maxVertexTextureImageUnits?: number | undefined;
  readonly maxCombinedTextureImageUnits?: number | undefined;
  readonly maxVertexUniformVectors?: number | undefined;
  readonly maxFragmentUniformVectors?: number | undefined;
  readonly maxVaryingVectors?: number | undefined;
  readonly maxVertexAttribs?: number | undefined;
  /** navigator.deviceMemory, in GB. Absent on Safari — its absence is itself a hint. */
  readonly deviceMemoryGb?: number | undefined;
  readonly devicePixelRatio?: number | undefined;
  readonly screenWidth?: number | undefined;
  readonly screenHeight?: number | undefined;
  readonly userAgent?: string | undefined;
};

const UNSUPPORTED: WebGLProbe = { ok: false, contextType: "none", failureReason: "no document" };

const numberParam = (gl: WebGLRenderingContext, name: number): number | undefined => {
  try {
    const value = gl.getParameter(name);
    return typeof value === "number" ? value : undefined;
  } catch {
    return undefined;
  }
};

const stringParam = (gl: WebGLRenderingContext, name: number): string | undefined => {
  try {
    const value = gl.getParameter(name);
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
};

// The unmasked strings ("Apple GPU", "ANGLE (...)") are what identify the
// actual hardware; the masked ones just say "WebKit". Safari has exposed the
// unmasked pair without the debug extension since 16.4, so try both.
const gpuStrings = (gl: WebGLRenderingContext): { vendor?: string | undefined; renderer?: string | undefined } => {
  try {
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (debugInfo) {
      const vendor = stringParam(gl, debugInfo.UNMASKED_VENDOR_WEBGL);
      const renderer = stringParam(gl, debugInfo.UNMASKED_RENDERER_WEBGL);
      if (vendor || renderer) return { vendor, renderer };
    }
  } catch {
    // fall through to the masked strings
  }
  return { vendor: stringParam(gl, gl.VENDOR), renderer: stringParam(gl, gl.RENDERER) };
};

const releaseContext = (gl: WebGLRenderingContext): void => {
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // Nothing to do — the throwaway canvas is unreferenced either way.
  }
};

const readProbe = (gl: WebGLRenderingContext, contextType: "webgl2" | "webgl"): WebGLProbe => {
  const { vendor, renderer } = gpuStrings(gl);
  return {
    ok: contextType === "webgl2",
    contextType,
    ...(contextType === "webgl"
      ? { failureReason: "webgl2 unavailable (only webgl1); three.js requires webgl2" }
      : {}),
    vendor,
    renderer,
    shadingLanguageVersion: stringParam(gl, gl.SHADING_LANGUAGE_VERSION),
    maxTextureSize: numberParam(gl, gl.MAX_TEXTURE_SIZE),
    maxCubeMapTextureSize: numberParam(gl, gl.MAX_CUBE_MAP_TEXTURE_SIZE),
    maxRenderbufferSize: numberParam(gl, gl.MAX_RENDERBUFFER_SIZE),
    maxTextureImageUnits: numberParam(gl, gl.MAX_TEXTURE_IMAGE_UNITS),
    maxVertexTextureImageUnits: numberParam(gl, gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
    maxCombinedTextureImageUnits: numberParam(gl, gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
    maxVertexUniformVectors: numberParam(gl, gl.MAX_VERTEX_UNIFORM_VECTORS),
    maxFragmentUniformVectors: numberParam(gl, gl.MAX_FRAGMENT_UNIFORM_VECTORS),
    maxVaryingVectors: numberParam(gl, gl.MAX_VARYING_VECTORS),
    maxVertexAttribs: numberParam(gl, gl.MAX_VERTEX_ATTRIBS)
  };
};

const environmentFacts = (): Partial<WebGLProbe> => {
  const facts: Record<string, unknown> = {};
  if (typeof navigator !== "undefined") {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof memory === "number") facts.deviceMemoryGb = memory;
    if (typeof navigator.userAgent === "string") facts.userAgent = navigator.userAgent;
  }
  if (typeof window !== "undefined") {
    if (typeof window.devicePixelRatio === "number") facts.devicePixelRatio = window.devicePixelRatio;
    if (window.screen) {
      facts.screenWidth = window.screen.width;
      facts.screenHeight = window.screen.height;
    }
  }
  return facts as Partial<WebGLProbe>;
};

/**
 * Creates a throwaway WebGL context to report what this device supports, then
 * releases it. Never throws: every failure mode resolves to a probe with
 * `ok: false` and a `failureReason` worth reading.
 */
export const runWebGLProbe = (): WebGLProbe => {
  if (typeof document === "undefined") return UNSUPPORTED;

  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
  } catch (error) {
    return { ...UNSUPPORTED, failureReason: `canvas creation failed: ${String(error)}` };
  }

  // Safari reports the real reason here and nowhere else; getContext() just
  // returns null. Capture it before the getContext calls that would fire it.
  let creationError: string | undefined;
  const onCreationError = (event: Event): void => {
    const message = (event as Event & { statusMessage?: string }).statusMessage;
    if (typeof message === "string" && message.length > 0) creationError = message;
  };
  canvas.addEventListener?.("webglcontextcreationerror", onCreationError);

  try {
    const gl2 = canvas.getContext?.("webgl2") as WebGLRenderingContext | null;
    if (gl2) {
      const probe = readProbe(gl2, "webgl2");
      releaseContext(gl2);
      return { ...probe, ...environmentFacts() };
    }

    const gl1 = (canvas.getContext?.("webgl") ?? canvas.getContext?.("experimental-webgl")) as WebGLRenderingContext | null;
    if (gl1) {
      const probe = readProbe(gl1, "webgl");
      releaseContext(gl1);
      return { ...probe, ...environmentFacts(), ...(creationError ? { failureReason: creationError } : {}) };
    }

    return {
      ok: false,
      contextType: "none",
      failureReason: creationError ?? "getContext returned null for both webgl2 and webgl",
      ...environmentFacts()
    };
  } catch (error) {
    return {
      ok: false,
      contextType: "none",
      failureReason: `getContext threw: ${String(error)}`,
      ...environmentFacts()
    };
  } finally {
    canvas.removeEventListener?.("webglcontextcreationerror", onCreationError);
  }
};

let cached: WebGLProbe | undefined;

/** Memoized {@link runWebGLProbe} — probing repeatedly would burn context slots. */
export const webGLProbe = (): WebGLProbe => {
  if (!cached) cached = runWebGLProbe();
  return cached;
};

/** Test-only: drops the memoized probe so the next call re-probes. */
export const resetWebGLProbeCache = (): void => {
  cached = undefined;
};

// Why 3D was abandoned this session, if it was. Recorded here rather than on
// ClientState so the diagnostics bundle can read it without the failure path
// needing a state handle, and so it survives whatever the renderer teardown
// does.
let rendererFailure: { readonly reason: string; readonly atMs: number } | undefined;

export const recordRendererFailure = (reason: string): void => {
  if (rendererFailure) return;
  rendererFailure = { reason, atMs: Date.now() };
};

export const rendererFailureSnapshot = (): { readonly reason: string; readonly atMs: number } | undefined =>
  rendererFailure;

/** Test-only: clears the recorded renderer failure. */
export const resetRendererFailure = (): void => {
  rendererFailure = undefined;
};

/** One-line summary suitable for an on-screen banner on a phone. */
export const describeWebGLProbe = (probe: WebGLProbe): string => {
  if (probe.ok) {
    return `webgl2 ok — ${probe.renderer ?? "unknown gpu"} (max texture ${probe.maxTextureSize ?? "?"})`;
  }
  return `webgl2 unavailable (${probe.contextType}) — ${probe.failureReason ?? "no reason reported"}`;
};
