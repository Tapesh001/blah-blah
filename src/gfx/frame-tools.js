/** Dimensions are physical pixels; the canvas CSS size remains caller-owned. */
export function frameSize(
  width,
  height,
  pixelRatio,
  renderScale,
  maxSize = 16384,
) {
  for (const value of [width, height, pixelRatio, renderScale, maxSize]) {
    if (!Number.isFinite(value) || value <= 0)
      throw new RangeError(
        'Frame dimensions and scale must be positive and finite',
      );
  }
  const scale = Math.min(1, Math.max(0.5, renderScale));
  const ratio = Math.min(pixelRatio, maxSize / width, maxSize / height);
  const canvasWidth = Math.max(1, Math.floor(width * ratio));
  const canvasHeight = Math.max(1, Math.floor(height * ratio));
  return {
    canvasWidth,
    canvasHeight,
    width: Math.max(1, Math.floor(canvasWidth * scale)),
    height: Math.max(1, Math.floor(canvasHeight * scale)),
    renderScale: scale,
  };
}

export class PassRegistry {
  constructor() {
    this.passes = [];
  }
  add(pass, before) {
    if (!pass.name || this.passes.some((p) => p.name === pass.name))
      throw new Error(`Duplicate or empty pass: ${pass.name}`);
    const index =
      before === undefined
        ? this.passes.length
        : this.passes.findIndex((p) => p.name === before);
    if (index < 0) throw new Error(`Unknown pass: ${before}`);
    this.passes.splice(index, 0, { enabled: true, ...pass });
  }
  setEnabled(name, enabled) {
    const pass = this.passes.find((p) => p.name === name);
    if (!pass) throw new Error(`Unknown pass: ${name}`);
    pass.enabled = Boolean(enabled);
  }
  resize(width, height) {
    for (const pass of this.passes) pass.resize?.(width, height);
  }
  dispose() {
    for (const pass of this.passes) pass.dispose?.();
    this.passes.length = 0;
  }
}

/** Nonblocking, non-nested WebGL2 timer queries. Samples always belong to a whole frame. */
export class GpuTimer {
  constructor(gl, maxPending = 8) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.maxPending = maxPending;
    this.pending = [];
    this.current = null;
    this.active = null;
    this.latest = null;
  }
  beginFrame(frame) {
    this.poll();
    this.current =
      this.ext && this.pending.length < this.maxPending
        ? { frame, queries: [] }
        : null;
  }
  begin(name) {
    if (!this.current) return;
    if (this.active) throw new Error('GPU timer queries cannot overlap');
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = { name, query };
  }
  end() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.current.queries.push(this.active);
    this.active = null;
  }
  endFrame() {
    this.end();
    if (this.current?.queries.length) this.pending.push(this.current);
    this.current = null;
  }
  poll() {
    if (!this.ext) return;
    const gl = this.gl;
    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      this.clear();
      return;
    }
    while (this.pending.length) {
      const sample = this.pending[0];
      if (
        !sample.queries.every((q) =>
          gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE),
        )
      )
        break;
      const passes = {};
      for (const { name, query } of sample.queries) {
        passes[name] =
          (passes[name] ?? 0) +
          gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
        gl.deleteQuery(query);
      }
      this.latest = {
        frame: sample.frame,
        passes,
        totalMs: Object.values(passes).reduce((a, b) => a + b, 0),
      };
      this.pending.shift();
    }
  }
  clear(contextLost = false) {
    if (!contextLost) {
      this.end();
      for (const frame of [
        ...this.pending,
        ...(this.current ? [this.current] : []),
      ]) {
        for (const { query } of frame.queries) this.gl.deleteQuery(query);
      }
    }
    this.active = this.current = this.latest = null;
    this.pending = [];
  }
}
