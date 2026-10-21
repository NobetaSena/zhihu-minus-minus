import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  getMemberRelations,
  MEMBER_ANSWERS_INCLUDE,
  MEMBER_ARTICLES_INCLUDE,
  MEMBER_PINS_INCLUDE,
  type ZhihuMember,
} from '@/api/zhihu';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  type CreationKind,
  fetchMergedCreationsPage,
  INITIAL_CREATIONS_CURSOR,
  type MergedCreation,
  type MergedCreationsCursor,
} from '@/utils/mergedCreations';
import { fetchOffsetPages } from '@/utils/parallelPaging';
import { refreshInfiniteQuery } from '@/utils/query';
import { useRefreshAction } from './useRefreshAction';

const CREATIONS_PAGE_SIZE = 20;

const CREATION_PARAMS: Record<
  CreationKind,
  { include: string; sort_by?: string; ws_qiangzhisafe?: number }
> = {
  answers: {
    include: MEMBER_ANSWERS_INCLUDE,
    sort_by: 'created',
    ws_qiangzhisafe: 0,
  },
  articles: { include: MEMBER_ARTICLES_INCLUDE, sort_by: 'created' },
  pins: { include: MEMBER_PINS_INCLUDE },
};

/**
 * 个人主页「创作」：回答、文章、想法按发布时间合并成一条可翻到底的时间线。
 */
export function useMergedUserCreations(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const parallelPaging = useSettingsStore(
    (state) => state.enableParallelPaging,
  );
  const memberKey = member?.url_token || member?.id;
  const queryKey = useMemo(
    () => ['user-merged-creations', memberKey] as const,
    [memberKey],
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      if (!memberKey) throw new Error('用户资料尚未加载');
      return fetchMergedCreationsPage(
        pageParam,
        (kind, offset) => {
          const fetchPage = (pageOffset: number) =>
            getMemberRelations(
              memberKey,
              kind,
              {
                ...CREATION_PARAMS[kind],
                offset: pageOffset,
                limit: CREATIONS_PAGE_SIZE,
              },
              { signal },
            );
          return parallelPaging
            ? fetchOffsetPages(fetchPage, offset, CREATIONS_PAGE_SIZE)
            : fetchPage(offset);
        },
        CREATIONS_PAGE_SIZE,
      );
    },
    initialPageParam: INITIAL_CREATIONS_CURSOR as MergedCreationsCursor,
    getNextPageParam: (lastPage) => lastPage.next,
    enabled: enabled && Boolean(memberKey),
  });
  const items = useMemo(() => {
    // Offset paging can repeat an item when new content shifts a list.
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.data) ?? []).filter(
      (creation: MergedCreation) => {
        const key = `${creation.kind}:${creation.item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      },
    );
  }, [query.data]);
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return { ...query, queryKey, items, refresh, refreshing };
}
