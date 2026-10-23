import { type InfiniteData, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import { markRecommendationUninterested } from '@/api/zhihu/feed';
import { feedCacheRepository } from '@/storage/feedCacheRepository';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import {
  type FeedIdentitySource,
  getFeedContentKey,
} from '@/utils/feedIdentity';
import {
  getRecommendFeedbackTarget,
  removeRecommendationFromPages,
} from '@/utils/recommendFeedback';
import { showToast } from '@/utils/toast';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export function useRecommendFeedback(accountKey: string | null) {
  const queryClient = useQueryClient();
  const sessionVersion = getAuthSessionVersion();
  const scopeKey = `${sessionVersion}:${accountKey || ''}`;
  const scope = useRef({
    key: scopeKey,
    hidden: new Set<string>(),
    pending: new Set<string>(),
  });
  if (scope.current.key !== scopeKey) {
    scope.current = {
      key: scopeKey,
      hidden: new Set<string>(),
      pending: new Set<string>(),
    };
  }
  const filterRecommendations = useCallback(
    <TItem extends FeedIdentitySource>(items: TItem[]): TItem[] => {
      const hidden = scope.current.hidden;
      return items.filter((item) => {
        const key = getFeedContentKey(item);
        return !key || !hidden.has(key);
      });
    },
    [],
  );

  const markUninterested = useCallback(
    async (item: FeedIdentitySource): Promise<void> => {
      const target = getRecommendFeedbackTarget(item);
      const contentKey = target && getFeedContentKey(target);
      if (
        !accountKey ||
        !target ||
        !contentKey ||
        sessionVersion !== getAuthSessionVersion() ||
        !hasAuthenticationCookie(useAuthStore.getState().cookies)
      )
        return;
      const startedScope = scope.current;
      if (
        startedScope.key !== scopeKey ||
        startedScope.pending.has(contentKey) ||
        startedScope.hidden.has(contentKey)
      )
        return;
      startedScope.pending.add(contentKey);
      try {
        await markRecommendationUninterested(target);
        if (
          scope.current !== startedScope ||
          sessionVersion !== getAuthSessionVersion()
        )
          return;
        startedScope.hidden.add(contentKey);
        const queryKey = ['zhihu-feed', accountKey, 'recommend'];
        await queryClient.cancelQueries({ queryKey });
        if (
          scope.current !== startedScope ||
          sessionVersion !== getAuthSessionVersion()
        )
          return;
        queryClient.setQueriesData<
          InfiniteData<{ items: FeedIdentitySource[] }, string>
        >({ queryKey }, (data) =>
          removeRecommendationFromPages(data, contentKey),
        );
        void feedCacheRepository
          .removeFeedCacheItem(
            { accountKey, feedType: 'recommend' },
            contentKey,
          )
          .catch(() => console.warn('移除启动 Feed 缓存条目失败'));
        showToast('将减少推荐相似内容');
      } catch (error: unknown) {
        if (
          scope.current === startedScope &&
          sessionVersion === getAuthSessionVersion()
        )
          showToast(getZhihuErrorMessage(error) || '反馈失败，请重试');
      } finally {
        startedScope.pending.delete(contentKey);
      }
    },
    [accountKey, queryClient, scopeKey, sessionVersion],
  );

  return { markUninterested, filterRecommendations };
}
