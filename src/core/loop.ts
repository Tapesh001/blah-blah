export const FIXED_DT = 1 / 60;
export const MAX_STEPS = 5;
export interface LoopHooks {
  input(): void;
  storm(dt: number): void;
  wind(): void;
  fixedUpdate(dt: number): void;
  physics(dt: number): void;
  frameUpdate(dt: number, alpha: number): void;
  camera(dt: number): void;
  environment(): void;
  render(): void;
  timeScale(): number;
  paused(): boolean;
}
/** Wall-clock accumulator; timeScale changes simulation dt, never tick frequency. */
export class FixedLoop {
  private accumulator = 0;
  private previous: number | null = null;
  private hidden = false;
  readonly stats = { steps: 0, frames: 0, alpha: 0, droppedSteps: 0 };
  constructor(private hooks: LoopHooks) {}
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.resetClock();
  }
  resetClock(): void {
    this.previous = null;
    this.accumulator = 0;
  }
  tick(nowMilliseconds: number): void {
    if (!Number.isFinite(nowMilliseconds)) return;
    if (this.hidden) {
      this.resetClock();
      return;
    }
    if (this.previous === null) {
      this.previous = nowMilliseconds;
      return;
    }
    const elapsed = Math.max(0, (nowMilliseconds - this.previous) / 1000);
    this.previous = nowMilliseconds;
    const requestedScale = this.hooks.timeScale();
    const scale = Number.isFinite(requestedScale)
      ? Math.max(0, requestedScale)
      : 1;
    const dt = FIXED_DT * scale;
    if (this.hooks.paused()) {
      this.accumulator = 0;
    } else {
      this.accumulator += elapsed;
      let count = 0;
      while (this.accumulator + 1e-10 >= FIXED_DT && count < MAX_STEPS) {
        this.hooks.input();
        if (this.hooks.paused()) {
          this.accumulator = 0;
          break;
        }
        this.hooks.storm(dt);
        this.hooks.wind();
        this.hooks.fixedUpdate(dt);
        this.hooks.physics(dt);
        this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
        count++;
        this.stats.steps++;
      }
      if (this.accumulator + 1e-10 >= FIXED_DT) {
        const dropped = Math.floor((this.accumulator + 1e-10) / FIXED_DT);
        this.stats.droppedSteps += dropped;
        this.accumulator = Math.max(0, this.accumulator - dropped * FIXED_DT);
      }
    }
    this.stats.alpha = this.accumulator / FIXED_DT;
    this.stats.frames++;
    this.hooks.frameUpdate(
      Math.min(elapsed, MAX_STEPS * FIXED_DT) * scale,
      this.stats.alpha,
    );
    this.hooks.camera(Math.min(elapsed, MAX_STEPS * FIXED_DT));
    this.hooks.environment();
    this.hooks.render();
  }
}
