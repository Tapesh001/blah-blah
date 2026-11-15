import { it, expect, vi } from 'vitest';
import {
  ChapterMachine,
  chapterTable,
  stubChapter,
} from '../src/game/chapters';
import { TypedEventBus } from '../src/core/events';
import { emptyInput } from '../src/core/input';
import type { GameContext } from '../src/contracts';
function context() {
  return {
    events: new TypedEventBus(),
    input: emptyInput(),
    chapter: 'title',
    routeProgress: 0,
  } as unknown as GameContext;
}
it('waits for load and guards repeated completion during a transition', async () => {
  const ctx = context();
  let release = () => {};
  const ride = stubChapter('ride');
  ride.load = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const entered = vi.fn();
  ctx.events.on('chapter:enter', entered);
  const machine = new ChapterMachine(ctx, chapterTable({ ride: () => ride }));
  await machine.goTo('title');
  const complete = machine.complete();
  expect(machine.loading).toBe(true);
  expect(ctx.chapter).toBe('title');
  await machine.complete();
  release();
  await complete;
  expect(ctx.chapter).toBe('ride');
  expect(entered).toHaveBeenCalledTimes(2);
  machine.dispose();
});
it('disposes failed loads and keeps the previous chapter', async () => {
  const ctx = context(),
    ride = stubChapter('ride');
  ride.load = async () => {
    throw new Error('asset failed');
  };
  ride.dispose = vi.fn();
  const machine = new ChapterMachine(ctx, chapterTable({ ride: () => ride }));
  await machine.goTo('title');
  await expect(machine.goTo('ride')).rejects.toThrow('asset failed');
  expect(ctx.chapter).toBe('title');
  expect(machine.loading).toBe(false);
  expect(ride.dispose).toHaveBeenCalledOnce();
  machine.dispose();
});
it('does not enter a chapter if disposed during its load', async () => {
  const ctx = context(),
    chapter = stubChapter('ride');
  let release = () => {};
  chapter.load = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  chapter.enter = vi.fn();
  chapter.dispose = vi.fn();
  const machine = new ChapterMachine(
    ctx,
    chapterTable({ ride: () => chapter }),
  );
  const pending = machine.goTo('ride');
  machine.dispose();
  release();
  await pending;
  expect(chapter.enter).not.toHaveBeenCalled();
  expect(chapter.dispose).toHaveBeenCalledOnce();
});
