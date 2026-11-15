import {
  WebGLRenderer,
  Scene,
  DepthTexture,
  UnsignedIntType,
  NoToneMapping,
  SRGBColorSpace,
  PCFShadowMap,
  Color,
} from 'three';
import { frameSize, PassRegistry, GpuTimer } from './frame-tools.js';
import {
  hdrTarget,
  PingPongTargets,
  FullscreenTriangle,
  fullscreenMaterial,
  presentationMaterial,
} from './fullscreen.js';

function objectStage(object) {
  for (let node = object; node; node = node.parent) {
    if (node.userData.gfxPass) return node.userData.gfxPass;
  }
  const materials = Array.isArray(object.material)
    ? object.material
    : [object.material];
  return materials.some((material) => material?.transparent)
    ? 'transparents'
    : 'opaque';
}

/**
 * Standalone T0.1 interface, pending the shared Gfx / QualitySettings contracts.
 * quality: { renderScale?: number, pixelRatio?: number, shadows?: boolean,
 *            passes?: Record<string, boolean> }.
 * Caller owns scene objects and the camera; no gameplay, wind or waves are simulated here.
 */
export function createGfx(canvas, quality = {}) {
  frameSize(
    canvas.clientWidth || 1,
    canvas.clientHeight || 1,
    quality.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
    quality.renderScale ?? 1,
  );
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: 'high-performance',
  });
  if (!renderer.extensions.has('EXT_color_buffer_float')) {
    renderer.dispose();
    throw new Error(
      'The graphics pipeline requires WebGL2 with EXT_color_buffer_float for RGBA16F rendering.',
    );
  }
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x070c12, 1);
  const scene = new Scene();
  const registry = new PassRegistry();
  const target = hdrTarget(1, 1, 'gfx.scene.hdr', true);
  target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
  target.depthTexture.name = 'gfx.scene.depth';
  const post = new PingPongTargets();
  const fullscreen = new FullscreenTriangle();
  const copy = fullscreenMaterial(
    'uniform sampler2D source; varying vec2 vUv; void main() { gl_FragColor = texture2D(source, vUv); }',
    { source: { value: null } },
  );
  const present = presentationMaterial();
  let timer = new GpuTimer(renderer.getContext());
  let size,
    disposed = false,
    lost = false,
    rendering = false,
    frame = 0;
  let activeStage = null,
    shadowCpuMs = 0,
    cpuPasses = {},
    output;
  let shadowOriginal, shadowOwner, observer;
  let latestStats = {
    frame: 0,
    contextLost: false,
    gpuMs: null,
    gpuFrame: null,
    passes: [],
  };
  const shaderErrors = [];
  renderer.debug.checkShaderErrors = true;
  renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
    const message = [
      gl.getProgramInfoLog(program),
      gl.getShaderInfoLog(vertex),
      gl.getShaderInfoLog(fragment),
    ]
      .filter(Boolean)
      .join('\n');
    shaderErrors.push(message || 'Unknown shader compilation failure');
    throw new Error(
      `Graphics shader compilation failed:\n${shaderErrors.at(-1)}`,
    );
  };

  // r170 calls shadowMap.render inside renderer.render before any colour draws.
  // Split the enclosing timer to measure that work separately, without nested GPU queries
  // or a second shadow draw. Each frame's query segments are summed by pass name.
  function installShadowTiming() {
    shadowOwner = renderer.shadowMap;
    shadowOwner.type = PCFShadowMap;
    shadowOwner.autoUpdate = false;
    shadowOriginal = shadowOwner.render;
    shadowOwner.render = function (...args) {
      if (!activeStage || !this.enabled || !this.needsUpdate)
        return shadowOriginal.apply(this, args);
      timer.end();
      timer.begin('shadows');
      const start = performance.now();
      try {
        return shadowOriginal.apply(this, args);
      } finally {
        shadowCpuMs += performance.now() - start;
        cpuPasses.shadows = shadowCpuMs;
        // Three leaves needsUpdate true when there are no shadow-casting lights.
        this.needsUpdate = false;
        timer.end();
        timer.begin(activeStage);
      }
    };
  }
  installShadowTiming();

  function drawScene(stage, camera) {
    const hidden = [];
    const background = scene.background;
    // A Three background can clear the entire target on each render. The sky belongs to
    // its explicit stage; a Color background is used once, by the frame's initial clear.
    scene.background = null;
    scene.traverse((object) => {
      if (
        (object.isMesh ||
          object.isLine ||
          object.isPoints ||
          object.isSprite) &&
        object.visible &&
        objectStage(object) !== stage
      ) {
        hidden.push([object, object.layers.mask]);
        object.layers.mask = 0;
      }
    });
    // Shadow casters must include all stages, even though colour draws are partitioned.
    const original = shadowOwner.render;
    shadowOwner.render = function (...args) {
      for (const [object, mask] of hidden) object.layers.mask = mask;
      try {
        return original.apply(this, args);
      } finally {
        for (const [object] of hidden) object.layers.mask = 0;
      }
    };
    try {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    } finally {
      shadowOwner.render = original;
      for (const [object, mask] of hidden) object.layers.mask = mask;
      scene.background = background;
    }
  }

  registry.add({
    name: 'clear',
    render() {
      renderer.setRenderTarget(target);
      renderer.setClearColor(
        scene.background?.isColor ? scene.background : new Color(0x070c12),
        1,
      );
      renderer.clear(true, true, true);
    },
  });
  registry.add({
    name: 'shadows',
    enabled: quality.shadows !== false,
    render() {},
  });
  for (const name of ['opaque', 'sky', 'ocean', 'transparents']) {
    registry.add({ name, render: ({ camera }) => drawScene(name, camera) });
  }
  registry.add({
    name: 'post',
    render() {
      copy.uniforms.source.value = output;
      fullscreen.render(renderer, copy, post.write);
      post.swap();
      output = post.read.texture;
    },
  });
  registry.add({
    name: 'upscale',
    render() {
      present.uniforms.source.value = output;
      fullscreen.render(renderer, present, null);
    },
  });
  for (const [name, enabled] of Object.entries(quality.passes ?? {}))
    registry.setEnabled(name, enabled);

  const perfEnabled =
    new URLSearchParams(globalThis.location?.search ?? '').get('perf') === '1';
  let overlay = null,
    overlayTime = -Infinity;
  if (perfEnabled) {
    overlay = document.createElement('pre');
    overlay.dataset.gfxPerf = '';
    overlay.setAttribute('aria-label', 'Graphics performance');
    overlay.style.cssText =
      'position:fixed;right:12px;top:12px;z-index:10000;margin:0;padding:12px;background:#06101ee8;color:#cde3e6;font:12px/1.5 monospace;pointer-events:none;border:1px solid #68808b;';
    document.body.append(overlay);
  }

  function assertLive() {
    if (disposed) throw new Error('Graphics pipeline has been disposed');
  }
  function resize(
    width = canvas.clientWidth || 1,
    height = canvas.clientHeight || 1,
    pixelRatio = quality.pixelRatio ?? globalThis.devicePixelRatio ?? 1,
  ) {
    assertLive();
    size = frameSize(
      width,
      height,
      pixelRatio,
      quality.renderScale ?? 1,
      renderer.capabilities.maxTextureSize,
    );
    renderer.setSize(size.canvasWidth, size.canvasHeight, false);
    target.setSize(size.width, size.height);
    post.resize(size.width, size.height);
    registry.resize(size.width, size.height);
    return { ...size };
  }
  function onLost(event) {
    event.preventDefault();
    lost = true;
    timer.clear(true);
    // Remove r170's old resource-disposal listeners while the context is still lost.
    // Otherwise a later resize/dispose attempts to delete handles from the old context.
    // dispose() releases GPU backing only; CPU geometry/material data remains reusable.
    target.dispose();
    post.dispose();
    fullscreen.dispose();
    const resources = new Set();
    scene.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!material) continue;
        resources.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture) resources.add(value);
        for (const uniform of Object.values(material.uniforms ?? {})) {
          for (const value of Array.isArray(uniform.value)
            ? uniform.value
            : [uniform.value]) {
            if (value?.isTexture) resources.add(value);
          }
        }
      }
      object.shadow?.dispose();
    });
    if (scene.background?.isTexture) resources.add(scene.background);
    if (scene.environment?.isTexture) resources.add(scene.environment);
    for (const resource of resources) resource.dispose();
    for (const pass of registry.passes) pass.onContextLost?.();
    latestStats = {
      ...latestStats,
      contextLost: true,
      gpuMs: null,
      gpuFrame: null,
    };
    if (overlay)
      overlay.textContent = 'Graphics context lost — waiting for restoration';
  }
  function onRestored() {
    // Three's listener runs first and rebuilds its WebGL internals. Targets, materials,
    // and caller-owned geometries re-upload lazily on the next render.
    timer = new GpuTimer(renderer.getContext());
    installShadowTiming();
    for (const pass of registry.passes) pass.onContextRestore?.();
    lost = false;
    resize();
  }
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  if (globalThis.ResizeObserver) {
    observer = new ResizeObserver(() => {
      if (!disposed && !lost) resize();
    });
    observer.observe(canvas);
  }
  resize();

  function render(camera, deltaTime = 0) {
    assertLive();
    if (lost || renderer.getContext().isContextLost()) return false;
    if (rendering) throw new Error('Graphics render cannot be re-entered');
    if (!camera?.isCamera)
      throw new TypeError('render requires a Three.js camera');
    rendering = true;
    const started = performance.now();
    renderer.info.reset();
    timer.beginFrame(++frame);
    cpuPasses = {};
    shadowCpuMs = 0;
    const shadows = registry.passes.find(
      (pass) => pass.name === 'shadows',
    ).enabled;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.needsUpdate = shadows;
    output = target.texture;
    try {
      for (const pass of registry.passes) {
        if (!pass.enabled || pass.name === 'shadows') continue;
        activeStage = pass.name;
        const start = performance.now(),
          shadowBefore = shadowCpuMs;
        timer.begin(pass.name);
        try {
          pass.render({
            camera,
            deltaTime,
            renderer,
            scene,
            input: output,
            depth: target.depthTexture,
            width: size.width,
            height: size.height,
            output: post.write,
            fullscreen,
          });
          if (pass.customPost) {
            post.swap();
            output = post.read.texture;
          }
        } finally {
          timer.end();
          cpuPasses[pass.name] = Math.max(
            0,
            performance.now() - start - (shadowCpuMs - shadowBefore),
          );
          activeStage = null;
        }
      }
      if (!registry.passes.find((pass) => pass.name === 'upscale').enabled) {
        renderer.setRenderTarget(null);
        renderer.setClearColor(0);
        renderer.clear();
      }
    } finally {
      timer.endFrame();
      renderer.setRenderTarget(null);
      activeStage = null;
      rendering = false;
    }
    const gpu = timer.latest;
    latestStats = {
      frame,
      contextLost: false,
      cpuMs: performance.now() - started,
      gpuMs: gpu?.totalMs ?? null,
      gpuFrame: gpu?.frame ?? null,
      gpuTimerSupported: Boolean(timer.ext),
      renderScale: size.renderScale,
      width: size.width,
      height: size.height,
      canvasWidth: size.canvasWidth,
      canvasHeight: size.canvasHeight,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      passes: registry.passes.map((pass) => ({
        name: pass.name,
        enabled: pass.enabled,
        cpuMs: pass.enabled ? (cpuPasses[pass.name] ?? 0) : null,
        gpuMs: pass.enabled ? (gpu?.passes[pass.name] ?? null) : null,
      })),
    };
    if (overlay && started - overlayTime >= 250) {
      const ms = (value) => (value == null ? 'n/a' : value.toFixed(2));
      overlay.textContent =
        `T0.1 · ${size.width}×${size.height} · scale ${size.renderScale.toFixed(2)}\n` +
        `CPU ${ms(latestStats.cpuMs)} ms · GPU ${ms(latestStats.gpuMs)} ms\n` +
        `${latestStats.drawCalls} draws · ${latestStats.triangles.toLocaleString()} triangles\n` +
        `Pass           CPU ms   GPU ms\n` +
        latestStats.passes
          .map(
            (p) =>
              `${p.name.padEnd(14)} ${p.enabled ? ms(p.cpuMs).padStart(6) + '   ' + ms(p.gpuMs).padStart(6) : 'off'}`,
          )
          .join('\n');
      overlayTime = started;
    }
    return true;
  }

  return {
    scene,
    renderer,
    render,
    resize,
    get stats() {
      return structuredClone(latestStats);
    },
    get shaderErrors() {
      return [...shaderErrors];
    },
    get size() {
      return { ...size };
    },
    setPassEnabled(name, enabled) {
      assertLive();
      registry.setEnabled(name, enabled);
      timer.clear();
    },
    registerPostPass(pass) {
      assertLive();
      if (typeof pass.render !== 'function')
        throw new TypeError('A post pass requires render(context)');
      registry.add({ ...pass, customPost: true }, 'upscale');
      pass.resize?.(size.width, size.height);
      timer.clear();
    },
    setRenderScale(renderScale) {
      assertLive();
      if (!Number.isFinite(renderScale) || renderScale <= 0)
        throw new RangeError('renderScale must be positive and finite');
      quality = { ...quality, renderScale };
      resize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      timer.clear(lost);
      overlay?.remove();
      registry.dispose();
      target.dispose();
      post.dispose();
      fullscreen.dispose();
      copy.dispose();
      present.dispose();
      shadowOwner.render = shadowOriginal;
      renderer.dispose();
    },
  };
}
