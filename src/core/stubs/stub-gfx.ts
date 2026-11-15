import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
  type Camera,
} from 'three';
import type { EnvState, Gfx } from '@contracts';
export class StubGfx implements Gfx {
  readonly scene = new Scene();
  readonly materials = {
    standard: (color: number) =>
      new MeshStandardMaterial({ color, roughness: 0.85 }),
  };
  readonly fx = { update: () => {}, dispose: () => {} };
  private renderer: WebGLRenderer;
  private observer: ResizeObserver;
  private water: Mesh;
  constructor(
    private container: HTMLElement,
    quality: 'low' | 'medium' | 'high',
  ) {
    this.renderer = new WebGLRenderer({ antialias: quality !== 'low' });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, quality === 'low' ? 1 : 2),
    );
    this.renderer.domElement.setAttribute('aria-label', 'Ocean scene');
    this.container.append(this.renderer.domElement);
    this.scene.background = new Color(0x223a47);
    this.scene.add(new AmbientLight(0xc5dfeb, 2));
    const sun = new DirectionalLight(0xffecd0, 3);
    sun.position.set(50, 80, 20);
    this.scene.add(sun);
    this.water = new Mesh(
      new PlaneGeometry(4000, 4000),
      this.materials.standard(0x255263),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }
  setEnvironment(env: EnvState): void {
    (this.scene.background as Color).setRGB(
      0.13 * (1 - env.storm * 0.5),
      0.23 * (1 - env.storm * 0.5),
      0.28 * (1 - env.storm * 0.3),
    );
  }
  render(camera: Camera): void {
    this.renderer.render(this.scene, camera);
  }
  resize(): void {
    this.renderer.setSize(
      Math.max(1, this.container.clientWidth),
      Math.max(1, this.container.clientHeight),
    );
  }
  dispose(): void {
    this.observer.disconnect();
    this.water.geometry.dispose();
    (this.water.material as MeshStandardMaterial).dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.scene.clear();
  }
}
