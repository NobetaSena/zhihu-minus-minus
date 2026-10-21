import { useSettingsStore } from '@/store/useSettingsStore';

/** With preloading on, ask for the next page while this many screens remain. */
export const PRELOAD_END_THRESHOLD = 3;
/** With preloading on, keep this many pixels of off-screen rows rendered. */
export const PRELOAD_DRAW_DISTANCE = 1500;

/**
 * 列表分页与屏外渲染的距离。开启「列表提前加载」后，离底部还有几屏时就请求下一页，
 * 并多渲染一段屏外内容，快速滑动时少见空白。
 */
export function useListPreload(endThreshold: number) {
  const enabled = useSettingsStore((state) => state.enableListPreload);
  return enabled
    ? {
        onEndReachedThreshold: Math.max(endThreshold, PRELOAD_END_THRESHOLD),
        drawDistance: PRELOAD_DRAW_DISTANCE,
      }
    : { onEndReachedThreshold: endThreshold };
}
