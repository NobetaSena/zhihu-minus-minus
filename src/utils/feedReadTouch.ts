import type { RawFeedItem } from '@/api/zhihu/feed';

export interface FeedReadTouchBatch {
  /** Distinguishes new responses even when a refresh returns identical IDs. */
  batchId: number;
  sessionVersion: number;
  answerIds: string[];
}

let nextBatchId = 0;

/** Capture the entire API batch before card parsing, filtering or local dedup. */
export function createFeedReadTouchBatch(
  items: readonly RawFeedItem[],
  sessionVersion: number,
): FeedReadTouchBatch {
  const ids = new Set<string>();
  for (const item of items) {
    const target = item.target ?? item;
    if (target.type !== 'answer') continue;
    // An unsafe numeric ID has already lost precision; never report a guessed ID.
    if (typeof target.id === 'number' && !Number.isSafeInteger(target.id))
      continue;
    const id = target.id?.toString().trim();
    if (id) ids.add(id);
  }
  return { batchId: nextBatchId++, sessionVersion, answerIds: [...ids] };
}

interface ReadTouchPage<T> {
  items: readonly T[];
  readTouchBatch?: FeedReadTouchBatch | null;
}

/** Which loaded page each card came from. */
export function indexFeedPageCards<T>(
  pages: readonly ReadTouchPage<T>[],
): Map<T, number> {
  const pageOf = new Map<T, number>();
  pages.forEach((page, index) => {
    for (const item of page.items) pageOf.set(item, index);
  });
  return pageOf;
}

/**
 * The response batches a reader has scrolled past: every page before the
 * furthest page with a card on screen. Cards from no loaded page are ignored.
 */
export function getPassedReadTouchBatches<T>(
  pages: readonly ReadTouchPage<T>[],
  pageOf: ReadonlyMap<T, number>,
  cardsOnScreen: Iterable<T>,
): Array<FeedReadTouchBatch | null | undefined> {
  let furthest = 0;
  for (const card of cardsOnScreen) {
    const page = pageOf.get(card);
    if (page !== undefined && page > furthest) furthest = page;
  }
  return pages.slice(0, furthest).map((page) => page.readTouchBatch);
}
