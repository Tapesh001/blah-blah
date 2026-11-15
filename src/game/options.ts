import { CHAPTERS, type ChapterId, type Quality } from '@contracts';
export interface LaunchOptions {
  chapter: ChapterId;
  checkpoint: string | null;
  storm: number | null;
  quality: Quality;
  seed: string;
}
export function parseOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search),
    chapter = params.get('chapter'),
    quality = params.get('q'),
    rawStorm = params.get('storm');
  const storm =
    rawStorm !== null && rawStorm.trim() !== '' ? Number(rawStorm) : NaN;
  return {
    chapter: CHAPTERS.includes(chapter as ChapterId)
      ? (chapter as ChapterId)
      : 'title',
    checkpoint: params.get('cp')?.slice(0, 128) || null,
    storm: Number.isFinite(storm) ? Math.min(1, Math.max(0, storm)) : null,
    quality: quality === 'low' || quality === 'high' ? quality : 'medium',
    seed: params.get('seed')?.slice(0, 128) || '7',
  };
}
