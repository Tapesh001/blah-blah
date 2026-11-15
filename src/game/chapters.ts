import {
  CHAPTERS,
  type Chapter,
  type ChapterFactory,
  type ChapterId,
  type GameContext,
} from '@contracts';
export const CHAPTER_COPY: Record<ChapterId, string> = {
  title: 'A road, an ocean, an island. Start the foundation journey.',
  ride: 'The bicycle chapter will join here. For now, continue to the harbour.',
  sail: 'The sailing chapter will join here. Continue across the water.',
  isle: 'The island chapter will join here. Continue to the end of the route.',
  ending:
    'You have explored the foundation. The full adventure is still being built.',
};
export function stubChapter(id: ChapterId): Chapter {
  return {
    id,
    load: async () => {},
    enter: () => {},
    fixedUpdate: (ctx) => {
      if (ctx.input.pressed.has('interact')) ctx.completeChapter();
    },
    frameUpdate: () => {},
    exit: () => {},
    dispose: () => {},
  };
}
export function chapterTable(
  overrides: Partial<Record<ChapterId, ChapterFactory>> = {},
): Record<ChapterId, ChapterFactory> {
  return Object.fromEntries(
    CHAPTERS.map((id) => [id, overrides[id] ?? (() => stubChapter(id))]),
  ) as Record<ChapterId, ChapterFactory>;
}
export class ChapterMachine {
  current: Chapter | null = null;
  loading = false;
  private pending: Promise<void> | null = null;
  private disposed = false;
  constructor(
    private ctx: GameContext,
    private factories: Record<ChapterId, ChapterFactory>,
  ) {}
  goTo(id: ChapterId): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error('Chapter machine disposed'));
    if (this.pending) return this.pending;
    if (!CHAPTERS.includes(id))
      return Promise.reject(new Error('Unknown chapter'));
    this.loading = true;
    this.pending = this.transition(id).finally(() => {
      this.pending = null;
      this.loading = false;
    });
    return this.pending;
  }
  private async transition(id: ChapterId): Promise<void> {
    const next = this.factories[id]();
    let entered = false;
    try {
      await next.load(this.ctx);
      if (this.disposed) {
        next.dispose();
        return;
      }
      this.current?.exit(this.ctx);
      this.current?.dispose();
      this.current = null;
      this.ctx.chapter = id;
      this.ctx.routeProgress = 0;
      this.ctx.input = {
        ...this.ctx.input,
        pressed: new Set(),
        released: new Set(),
      };
      next.enter(this.ctx);
      entered = true;
      this.current = next;
      this.ctx.events.emit('chapter:enter', { chapter: id });
    } catch (error) {
      if (!entered) next.dispose();
      throw error;
    }
  }
  async complete(): Promise<void> {
    if (this.loading || !this.current || this.disposed) return;
    const id = this.current.id;
    this.ctx.events.emit('chapter:complete', { chapter: id });
    const index = CHAPTERS.indexOf(id);
    await this.goTo(CHAPTERS[(index + 1) % CHAPTERS.length]!);
  }
  dispose(): void {
    this.disposed = true;
    this.current?.exit(this.ctx);
    this.current?.dispose();
    this.current = null;
  }
}
