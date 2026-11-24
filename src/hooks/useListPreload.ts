import { type RefObject, useEffect, useRef } from 'react';
import {
  type EndGeometry,
  isNearEnd,
  MAX_RESTING_FOLLOW_UPS,
} from '@/hooks/useEndReachedPagination';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * With preloading on, ask for the next page while this many screens remain.
 * FlashList asks once per approach to the end, so this distance is the whole
 * buffer that hides a slow page request during a fast fling.
 */
export const PRELOAD_END_THRESHOLD = 8;

export { MAX_RESTING_FOLLOW_UPS };

/**
 * 列表分页距离；开启「列表预加载」后提前请求下一页。
 * 只提前请求、不加大屏外渲染：真机实测 drawDistance 1500px 让快速滑动的掉帧
 * 从约 3% 升到 10–17%（回答卡片挂载开销大）。
 * 开启后同时隐藏竖向滚动条：列表不断在底部追加，滚动条的长短与位置一直在变，
 * 已不能说明读到了哪里。关闭时不改列表自己的滚动条设置。
 */
export function useListPreload(endThreshold: number): {
  onEndReachedThreshold: number;
  showsVerticalScrollIndicator?: false;
} {
  const enabled = useListPreloadEnabled();
  return enabled
    ? {
        onEndReachedThreshold: Math.max(endThreshold, PRELOAD_END_THRESHOLD),
        showsVerticalScrollIndicator: false,
      }
    : { onEndReachedThreshold: endThreshold };
}

export function useListPreloadEnabled(): boolean {
  return useSettingsStore((state) => state.enableListPreload);
}

/**
 * FlashList calls onEndReached only as the list enters its end zone. With the
 * preload threshold that zone spans several pages, so a page that arrives while
 * the reader is inside it does not trigger the next one, and paging stalls
 * until the reader hits the real bottom. After each load settles, ask again
 * while the list is still in the end zone. A load that made the list longer
 * may always ask again; only loads that added nothing at one scroll offset
 * are limited, to MAX_RESTING_FOLLOW_UPS. A limit on growing loads could stop
 * inside the zone, and scrolling further never re-enters it, so the reader
 * would reach the bottom with nothing left to start the next page.
 *
 * A list that is not on screen drops these attempts. When it becomes active
 * again it asks once more with a fresh follow-up budget: a short feed restored
 * under another screen stays inside the zone, and coming back neither enters
 * the zone nor finishes a load, so nothing else would ask for the next page.
 *
 * The upstream pagination hook only follows up a load that added nothing,
 * which is enough at its half-screen threshold; this runs only while
 * preloading is on.
 */
export function useLoadMoreNearEnd({
  enabled,
  active = true,
  listRef,
  threshold,
  loading,
  loadMore,
}: {
  enabled: boolean;
  /** Whether the list is on screen; loads asked for while inactive are dropped. */
  active?: boolean;
  listRef: RefObject<EndGeometry | null>;
  threshold: number;
  loading: boolean;
  loadMore: () => void;
}) {
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const resting = useRef({
    offset: Number.NaN,
    content: Number.NaN,
    followUps: 0,
  });

  useEffect(() => {
    if (!active) resting.current = { ...resting.current, followUps: 0 };
  }, [active]);

  useEffect(() => {
    if (!enabled || !active || loading) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || !isNearEnd(list, threshold)) return;
      const offset = list.getAbsoluteLastScrollOffset?.() ?? 0;
      const content = list.getChildContainerDimensions?.().height ?? 0;
      // NaN at first: any content counts as growth.
      if (
        offset !== resting.current.offset ||
        !(content <= resting.current.content)
      )
        resting.current = { offset, content, followUps: 0 };
      if (resting.current.followUps >= MAX_RESTING_FOLLOW_UPS) return;
      resting.current.followUps += 1;
      loadMoreRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, enabled, listRef, loading, threshold]);
}
