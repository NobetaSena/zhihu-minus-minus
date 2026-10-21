import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * With preloading on, ask for the next page while this many screens remain.
 * FlashList asks once per approach to the end, so this distance is the whole
 * buffer that hides a slow page request during a fast fling.
 */
export const PRELOAD_END_THRESHOLD = 8;
/** With preloading on, keep this many pixels of off-screen rows rendered. */
export const PRELOAD_DRAW_DISTANCE = 1500;

/** 列表分页与屏外渲染的距离；开启「列表预加载」后提前请求下一页并多渲染屏外内容。 */
export function useListPreload(endThreshold: number) {
  const enabled = useSettingsStore((state) => state.enableListPreload);
  return enabled
    ? {
        onEndReachedThreshold: Math.max(endThreshold, PRELOAD_END_THRESHOLD),
        drawDistance: PRELOAD_DRAW_DISTANCE,
      }
    : { onEndReachedThreshold: endThreshold };
}
