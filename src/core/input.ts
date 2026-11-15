import type { ActionId, Input, InputState } from '@contracts';
export const BINDINGS: Readonly<Record<string, ActionId>> = {
  KeyE: 'interact',
  Space: 'jump',
  ShiftLeft: 'run',
  KeyQ: 'haulLow',
  KeyR: 'ease',
  KeyZ: 'shiftDown',
  KeyX: 'shiftUp',
  KeyV: 'camera',
  KeyH: 'hint',
  KeyU: 'undo',
  KeyM: 'map',
  Escape: 'pause',
  ArrowUp: 'reefUp',
  ArrowDown: 'reefDown',
};
export const emptyInput = (): InputState => ({
  throttle: 0,
  steer: 0,
  look: { x: 0, y: 0 },
  down: new Set(),
  pressed: new Set(),
  released: new Set(),
});
/** M0 keyboard/pointer-button adapter; full multi-device input is M1. */
export class KeyboardInput implements Input {
  private keys = new Set<string>();
  private down = new Set<ActionId>();
  private pressed = new Set<ActionId>();
  private released = new Set<ActionId>();
  private abort = new AbortController();
  constructor(
    target?: Window,
    private onPause?: () => void,
  ) {
    target?.addEventListener(
      'keydown',
      (e) => {
        if (
          e.target instanceof HTMLElement &&
          /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
        )
          return;
        const action = BINDINGS[e.code];
        if (action || ['KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code))
          e.preventDefault();
        if (this.keys.has(e.code)) return;
        this.keys.add(e.code);
        if (action === 'pause') {
          onPause?.();
          return;
        }
        if (action) this.press(action);
      },
      { signal: this.abort.signal },
    );
    target?.addEventListener(
      'keyup',
      (e) => {
        this.keys.delete(e.code);
        const action = BINDINGS[e.code];
        if (action) this.release(action);
      },
      { signal: this.abort.signal },
    );
    target?.addEventListener('blur', () => this.clear(), {
      signal: this.abort.signal,
    });
  }
  press(action: ActionId): void {
    if (!this.down.has(action)) this.pressed.add(action);
    this.down.add(action);
  }
  release(action: ActionId): void {
    if (this.down.delete(action)) this.released.add(action);
  }
  pulse(action: ActionId): void {
    this.press(action);
    this.release(action);
  }
  snapshot(): InputState {
    const state = {
      throttle: Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')),
      steer: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
      look: { x: 0, y: 0 },
      down: new Set(this.down),
      pressed: new Set(this.pressed),
      released: new Set(this.released),
    };
    this.pressed.clear();
    this.released.clear();
    return state;
  }
  clear(): void {
    this.keys.clear();
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
  }
  dispose(): void {
    this.abort.abort();
    this.clear();
  }
}
