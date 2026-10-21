import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * With preloading on, ask for the next page while this many screens remain.
 * FlashList asks once per approach to the end, so this distance is the whole
 * buffer that hides a slow page request during a fast fling.
 */
export const PRELOAD_END_THRESHOLD = 8;

/**
 * 列表分页距离；开启「列表预加载」后提前请求下一页。
 * 只提前请求、不加大屏外渲染：真机实测 drawDistance 1500px 让快速滑动的掉帧
 * 从约 3% 升到 10–17%（回答卡片挂载开销大）。
 */
export function useListPreload(endThreshold: number) {
  const enabled = useSettingsStore((state) => state.enableListPreload);
  return {
    onEndReachedThreshold: enabled
      ? Math.max(endThreshold, PRELOAD_END_THRESHOLD)
      : endThreshold,
  };
}
