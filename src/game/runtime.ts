import {
  CONTRACT_VERSION,
  type GameContext,
  type SandboxOptions,
} from '@contracts';
import {
  advanceEnvironment,
  clamp,
  createEnvironment,
  emptyInput,
  FixedLoop,
  KeyboardInput,
  SeededRng,
  TypedEventBus,
} from '@core';
import { FoundationUi } from '@ui';
import { ChapterMachine, chapterTable, CHAPTER_COPY } from './chapters';
import { parseOptions } from './options';
import { createServices } from './services';
export async function startGame(
  options: SandboxOptions = {},
): Promise<GameContext> {
  const container =
    options.container ?? document.querySelector<HTMLElement>('#app');
  if (!container) throw new Error('Missing #app container');
  const launch = parseOptions(location.search);
  const seed = options.seed ?? launch.seed,
    quality = options.quality ?? launch.quality;
  let stormOverride = launch.storm,
    disposed = false,
    animation = 0,
    mountCleanup: (() => void) | undefined;
  const services = createServices(container, { ...options, seed, quality });
  const events = new TypedEventBus(),
    env = createEnvironment();
  const input = new KeyboardInput(window, () => {
    ctx.paused = !ctx.paused;
    input.clear();
    loop.resetClock();
  });
  const ctx: GameContext = {
    ...services,
    rng: new SeededRng(seed),
    events,
    env,
    windBake: services.wind.bake({ x: 0, y: 10, z: 0 }, 0),
    input: emptyInput(),
    chapter: options.chapter ?? launch.chapter,
    checkpoint: launch.checkpoint,
    quality,
    seed,
    timeScale: 1,
    routeProgress: 0,
    paused: false,
    setRouteProgress(value) {
      if (Number.isFinite(value)) ctx.routeProgress = clamp(value);
    },
    completeChapter() {
      void machine.complete().catch(reportError);
    },
    setStorm(value) {
      if (value === null || Number.isFinite(value)) {
        stormOverride = value === null ? null : clamp(value);
        if (stormOverride !== null) env.storm = stormOverride;
      }
    },
  };
  if (!options.services?.ui) {
    ctx.ui.dispose();
    ctx.ui = new FoundationUi(
      container,
      () => input.pulse('interact'),
      () => {
        ctx.paused = !ctx.paused;
        input.clear();
        loop.resetClock();
      },
    );
  }
  const machine = new ChapterMachine(ctx, chapterTable(options.chapters));
  const refreshUi = () =>
    ctx.ui.update({
      chapter: ctx.chapter,
      objective: CHAPTER_COPY[ctx.chapter],
      prompt:
        ctx.chapter === 'ending'
          ? 'Begin again · E'
          : ctx.chapter === 'title'
            ? 'Start journey · E'
            : 'Continue · E',
      speed: 0,
      checkpoint: ctx.checkpoint,
      loading: machine.loading,
      paused: ctx.paused,
    });
  const loop = new FixedLoop({
    timeScale: () => ctx.timeScale,
    paused: () => ctx.paused || machine.loading,
    input: () => {
      ctx.input = input.snapshot();
    },
    storm: (dt) =>
      advanceEnvironment(env, dt, ctx.routeProgress, stormOverride),
    wind: () => {
      ctx.windBake = ctx.wind.bake(ctx.camera.position(), env.time);
    },
    fixedUpdate: (dt) => machine.current?.fixedUpdate(ctx, dt),
    physics: (dt) => ctx.physics.step(dt),
    frameUpdate: (dt, alpha) => {
      if (!ctx.paused && !machine.loading)
        machine.current?.frameUpdate(ctx, dt, alpha);
      refreshUi();
    },
    camera: (dt) => ctx.camera.update(ctx.paused ? 0 : dt),
    environment: () => ctx.gfx.setEnvironment(env),
    render: () => ctx.gfx.render(ctx.camera.camera),
  });
  function reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    ctx.paused = true;
    events.emit('error', { message });
    ctx.ui.toast(message);
    console.error(error);
  }
  const onVisibility = () => {
    loop.setHidden(document.hidden);
    input.clear();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const completed: { chapter: GameContext['chapter'] }[] = [];
  events.on('chapter:complete', (payload) => {
    completed.push(payload);
    if (completed.length > 100) completed.shift();
  });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animation);
    document.removeEventListener('visibilitychange', onVisibility);
    mountCleanup?.();
    machine.dispose();
    input.dispose();
    ctx.camera.dispose();
    ctx.physics.dispose();
    ctx.audio.dispose();
    ctx.ui.dispose();
    ctx.save.dispose();
    ctx.gfx.fx.dispose();
    ctx.gfx.dispose();
    events.clear();
    window.__cg.ready = false;
  };
  window.__cg = {
    version: CONTRACT_VERSION,
    ready: false,
    chapter: () => ctx.chapter,
    goTo: async (id) => {
      await machine.goTo(id);
      input.clear();
      loop.resetClock();
      refreshUi();
    },
    setStorm: ctx.setStorm,
    setRouteProgress: ctx.setRouteProgress,
    setTimeScale: (value) => {
      if (Number.isFinite(value)) ctx.timeScale = clamp(value, 0, 4);
    },
    checkpoint: (id) => {
      ctx.checkpoint = id;
      ctx.save.checkpoint(id);
      events.emit('checkpoint', { id });
    },
    stats: () => ({ ...loop.stats, time: env.time, storm: env.storm }),
    events: completed,
    dispose,
  };
  const frame = (time: number) => {
    if (disposed) return;
    try {
      loop.tick(time);
      animation = requestAnimationFrame(frame);
    } catch (error) {
      reportError(error);
      dispose();
    }
  };
  try {
    refreshUi();
    await machine.goTo(ctx.chapter);
    ctx.setStorm(launch.storm);
    const cleanup = await options.mount?.(ctx);
    if (typeof cleanup === 'function') mountCleanup = cleanup;
    refreshUi();
    window.__cg.ready = true;
    onVisibility();
    animation = requestAnimationFrame(frame);
  } catch (error) {
    dispose();
    throw error;
  }
  return ctx;
}
