import { hashKey, type QueryKey } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { touchAnswersRead } from '@/api/zhihu/lastRead';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import type { FeedReadTouchBatch } from '@/utils/feedReadTouch';
import { useActiveScreen } from './useActiveScreen';

/**
 * Read feedback while list preloading is on.
 *
 * Without preloading, `useFeedPageReadTouch` reports a page as the next one is
 * requested, which happens as the reader nears its end. Preloading requests
 * pages screens ahead of the reader, so that hook is told not to report
 * (`reportOnPass`), and the list calls the function returned here with the
 * batches of every page before the furthest card on screen
 * (`getPassedReadTouchBatches`).
 *
 * Same limits as the request-time report: only the active, enabled list of the
 * signed-in session it was loaded under; each batch once, a failed one again
 * the next time it is passed.
 */
export function useFeedReadTouchOnPass(
  queryKey: QueryKey,
  enabled: boolean,
): (batches: ReadonlyArray<FeedReadTouchBatch | null | undefined>) => void {
  const active = useActiveScreen();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const scope = hashKey(queryKey);
  const recorded = useMemo(
    () => ({
      scope,
      sessionVersion,
      batches: new WeakSet<FeedReadTouchBatch>(),
    }),
    [scope, sessionVersion],
  );
  const current = useRef({ enabled, active, recorded });
  current.current = { enabled, active, recorded };

  return useCallback(
    (batches) => {
      if (
        !current.current.enabled ||
        !current.current.active ||
        current.current.recorded !== recorded ||
        sessionVersion !== getAuthSessionVersion() ||
        !hasAuthenticationCookie(useAuthStore.getState().cookies)
      )
        return;
      for (const batch of batches) {
        if (
          !batch ||
          batch.sessionVersion !== sessionVersion ||
          batch.answerIds.length === 0 ||
          recorded.batches.has(batch)
        )
          continue;
        recorded.batches.add(batch);
        void touchAnswersRead(batch.answerIds, { sessionVersion }).catch(() => {
          // Passing this page again may retry the feedback.
          recorded.batches.delete(batch);
        });
      }
    },
    [recorded, sessionVersion],
  );
}
