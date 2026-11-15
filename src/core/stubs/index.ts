import { PerspectiveCamera } from 'three';
import type {
  AudioBus,
  Bench,
  CameraRig,
  Physics,
  SaveStore,
  Ui,
} from '@contracts';
export { StubWind } from './wind';
export { StubTerrain } from './terrain';
export { StubOcean } from './ocean';
export { StubGfx } from './stub-gfx';
export class StubCamera implements CameraRig {
  readonly camera = new PerspectiveCamera(55, 1, 0.1, 5000);
  constructor(private container: HTMLElement) {
    this.camera.position.set(0, 9, 24);
    this.camera.lookAt(0, 1, -45);
  }
  update(): void {
    const aspect =
      this.container.clientWidth / Math.max(1, this.container.clientHeight);
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
  }
  position() {
    return this.camera.position;
  }
  dispose(): void {}
}
export class StubBench implements Bench {
  solve(signal?: AbortSignal): Promise<{ solved: true }> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve({ solved: true });
      }, 1000);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
}
export class StubAudio implements AudioBus {
  set(): void {}
  play(): void {}
  dispose(): void {}
}
export class StubUi implements Ui {
  update(): void {}
  toast(): void {}
  dispose(): void {}
}
export class StubPhysics implements Physics {
  step(): void {}
  dispose(): void {}
}
export class StubSave implements SaveStore {
  checkpoint(): void {}
  dispose(): void {}
}
