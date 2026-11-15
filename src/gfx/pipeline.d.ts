import type {
  Camera,
  Material,
  Scene,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
/** Typed bridge for the standalone T0.1 renderer; not yet the shared Gfx service. */
export interface PipelineQuality {
  renderScale?: number;
  pixelRatio?: number;
  shadows?: boolean;
  passes?: Record<string, boolean>;
}
export interface FrameSize {
  canvasWidth: number;
  canvasHeight: number;
  width: number;
  height: number;
  renderScale: number;
}
export interface PipelineStats {
  frame: number;
  contextLost: boolean;
  gpuMs: number | null;
  gpuFrame: number | null;
  cpuMs?: number;
  gpuTimerSupported?: boolean;
  renderScale?: number;
  width?: number;
  height?: number;
  canvasWidth?: number;
  canvasHeight?: number;
  drawCalls?: number;
  triangles?: number;
  geometries?: number;
  textures?: number;
  passes: {
    name: string;
    enabled: boolean;
    cpuMs: number | null;
    gpuMs: number | null;
  }[];
}
export interface PostContext {
  camera: Camera;
  deltaTime: number;
  renderer: WebGLRenderer;
  scene: Scene;
  input: Texture;
  depth: Texture;
  width: number;
  height: number;
  output: WebGLRenderTarget;
  fullscreen: {
    render(
      renderer: WebGLRenderer,
      material: Material,
      target: WebGLRenderTarget | null,
    ): void;
    dispose(): void;
  };
}
export interface PostPass {
  name: string;
  enabled?: boolean;
  render(context: PostContext): void;
  resize?(width: number, height: number): void;
  onContextLost?(): void;
  onContextRestore?(): void;
  dispose?(): void;
}
export interface FramePipeline {
  scene: Scene;
  renderer: WebGLRenderer;
  render(camera: Camera, deltaTime?: number): boolean;
  resize(width?: number, height?: number, pixelRatio?: number): FrameSize;
  readonly stats: PipelineStats;
  readonly shaderErrors: string[];
  readonly size: FrameSize;
  setPassEnabled(name: string, enabled: boolean): void;
  registerPostPass(pass: PostPass): void;
  setRenderScale(scale: number): void;
  dispose(): void;
}
export function createGfx(
  canvas: HTMLCanvasElement,
  quality?: PipelineQuality,
): FramePipeline;
