import { act, renderHook } from '@testing-library/react-native';
import { useCallback, useState } from 'react';
import {
  isNearEnd,
  useEndReachedPagination,
} from '../src/hooks/useEndReachedPagination';
import { useLoadMoreNearEnd } from '../src/hooks/useListPreload';

/**
 * Upstream pagination plus list preloading, driven the way FlashList 2 drives
 * onEndReached: `checkBounds` runs after every scroll event and every commit,
 * and calls onEndReached only when the list goes from outside to inside the end
 * zone (useBoundDetection.js).
 */
const VIEWPORT = 1000;
/** One recommendation page: 6 cards, about 2.5 screens. */
const PAGE_HEIGHT = 2500;
const LATENCY_MS = 300;
const LAST_PAGE = 30;

function simulate({
  threshold,
  followUp,
  pageHeight = PAGE_HEIGHT,
}: {
  threshold: number;
  followUp: boolean;
  pageHeight?: number;
}) {
  const geometry = { offset: 0, content: pageHeight };
  const list = {
    getAbsoluteLastScrollOffset: () => geometry.offset,
    getWindowSize: () => ({ width: 400, height: VIEWPORT }),
    getChildContainerDimensions: () => ({
      width: 400,
      height: geometry.content,
    }),
    getFirstItemOffset: () => 0,
  };
  const listRef = { current: list };
  let requests = 0;

  const useFeed = () => {
    const [pages, setPages] = useState(1);
    const [busy, setBusy] = useState(false);
    const fetchNextPage = useCallback(() => {
      requests += 1;
      setBusy(true);
      const promise = new Promise<void>((resolve) =>
        setTimeout(() => {
          geometry.content += pageHeight;
          setPages((count) => count + 1);
          setBusy(false);
          resolve();
        }, LATENCY_MS),
      );
      return { status: 'started' as const, promise };
    }, []);
    const { handleEndReached } = useEndReachedPagination({
      isActive: true,
      hasNextPage: pages < LAST_PAGE,
      isFetchNextPageError: false,
      isBusy: busy,
      cursor: pages,
      onFetchNextPage: fetchNextPage,
      itemCount: pages * 6,
      listRef,
      endReachedThreshold: threshold,
    });
    useLoadMoreNearEnd({
      enabled: followUp,
      listRef,
      threshold,
      loading: busy,
      loadMore: handleEndReached,
    });
    return { pages, handleEndReached };
  };

  return { geometry, list, useFeed, requests: () => requests };
}

async function read({
  threshold,
  followUp,
  seconds,
  pageHeight,
  pauseSeconds = 0,
}: {
  threshold: number;
  followUp: boolean;
  seconds: number;
  pageHeight?: number;
  /** The reader first rests at the top while pages arrive. */
  pauseSeconds?: number;
}) {
  const sim = simulate({ threshold, followUp, pageHeight });
  const host = await renderHook(sim.useFeed);
  let pendingEndReached = false;
  const checkBounds = () => {
    const near = isNearEnd(sim.list, threshold);
    if (near && !pendingEndReached) {
      pendingEndReached = true;
      host.result.current.handleEndReached();
    }
    pendingEndReached = near;
  };

  // Reading at two screens a second, one scroll event per 100ms.
  let stepsAtBottom = 0;
  await act(async () => checkBounds());
  for (let step = 0; step < pauseSeconds * 10; step += 1) {
    await act(async () => jest.advanceTimersByTime(100));
    await act(async () => checkBounds());
  }
  for (let step = 0; step < seconds * 10; step += 1) {
    const bottom = sim.geometry.content - VIEWPORT;
    sim.geometry.offset = Math.min(sim.geometry.offset + 200, bottom);
    if (sim.geometry.offset >= bottom) stepsAtBottom += 1;
    await act(async () => checkBounds());
    await act(async () => jest.advanceTimersByTime(100));
    await act(async () => checkBounds());
  }
  const result = {
    pages: host.result.current.pages,
    requests: sim.requests(),
    stepsAtBottom,
  };
  if (process.env.DEBUG_PAGINATION)
    console.log({ threshold, followUp, ...result });
  await host.unmount();
  return result;
}

describe('preloaded pagination over FlashList edge-triggered onEndReached', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('upstream half-screen threshold keeps loading but stalls at the bottom', async () => {
    const result = await read({ threshold: 0.5, followUp: false, seconds: 20 });
    expect(result.pages).toBeGreaterThan(10);
    expect(result.stepsAtBottom).toBeGreaterThan(0);
  });

  test('an 8-screen threshold alone stops paging after the second page', async () => {
    const result = await read({ threshold: 8, followUp: false, seconds: 20 });
    expect(result.pages).toBe(2);
    expect(result.requests).toBe(1);
    expect(result.stepsAtBottom).toBeGreaterThan(100);
  });

  test('an 8-screen threshold with follow-ups keeps pages ahead of the reader', async () => {
    const result = await read({ threshold: 8, followUp: true, seconds: 20 });
    expect(result.stepsAtBottom).toBe(0);
    // The reader went 40 screens in 20s; loading stays about 8 screens ahead.
    const loadedScreens = (result.pages * PAGE_HEIGHT) / VIEWPORT;
    expect(loadedScreens - 40).toBeGreaterThanOrEqual(8);
    expect(loadedScreens - 40).toBeLessThan(8 + PAGE_HEIGHT / VIEWPORT + 1);
    // One request per page: follow-ups never repeat a cursor.
    expect(result.requests).toBe(result.pages - 1);
  });

  test('short pages loaded while the reader rests keep loading once reading resumes', async () => {
    // Filtered or collapsed pages: one screen each. Resting at the top uses up
    // the follow-ups while the list is still inside the 8-screen zone.
    const result = await read({
      threshold: 8,
      followUp: true,
      seconds: 10,
      pageHeight: 1000,
      pauseSeconds: 5,
    });
    // 20 screens read, of 30 available.
    expect(result.stepsAtBottom).toBe(0);
    // One request per page, with at most the last one still in flight.
    expect(result.requests - (result.pages - 1)).toBeLessThanOrEqual(1);
  });
});
