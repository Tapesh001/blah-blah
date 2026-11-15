export function frameSize(
  width: number,
  height: number,
  pixelRatio: number,
  renderScale: number,
  maxSize?: number,
): {
  canvasWidth: number;
  canvasHeight: number;
  width: number;
  height: number;
  renderScale: number;
};
export interface FramePass {
  name: string;
  enabled?: boolean;
  resize?(width: number, height: number): void;
  dispose?(): void;
}
export class PassRegistry {
  passes: FramePass[];
  add(pass: FramePass, before?: string): void;
  setEnabled(name: string, enabled: boolean): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
export class GpuTimer {
  constructor(gl: WebGL2RenderingContext, maxPending?: number);
  latest: {
    frame: number;
    passes: Record<string, number>;
    totalMs: number;
  } | null;
  beginFrame(frame: number): void;
  begin(name: string): void;
  end(): void;
  endFrame(): void;
  poll(): void;
  clear(contextLost?: boolean): void;
}
