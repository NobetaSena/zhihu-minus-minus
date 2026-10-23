import {
  type InfiniteData,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { markRecommendationUninterested } from '../src/api/zhihu/feed';
import { useRecommendFeedback } from '../src/hooks/useRecommendFeedback';
import { feedCacheRepository } from '../src/storage/feedCacheRepository';
import type { FeedIdentitySource } from '../src/utils/feedIdentity';
import {
  getRecommendFeedbackTarget,
  removeRecommendationFromPages,
} from '../src/utils/recommendFeedback';
import { showToast } from '../src/utils/toast';

jest.mock('../src/api/zhihu/feed', () => ({
  markRecommendationUninterested: jest.fn(),
}));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookies: string | null) => Boolean(cookies),
}));
jest.mock('../src/storage/feedCacheRepository', () => ({
  feedCacheRepository: { removeFeedCacheItem: jest.fn(async () => {}) },
}));
let mockSessionVersion = 1;
let mockCookies: string | null = 'synthetic-session';
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: { getState: () => ({ cookies: mockCookies }) },
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/utils/zhihuError', () => ({
  getZhihuErrorMessage: () => '合成反馈错误',
}));

const answer = { id: 'same-token', type: 'answers' } as const;
const article = { id: 'same-token', type: 'articles' } as const;
const otherAnswer = { id: 'other-token', type: 'answers' } as const;
const clients: QueryClient[] = [];
const queryKey = ['zhihu-feed', 'id:account-a', 'recommend', {}];

function pages(
  items: FeedIdentitySource[] = [answer, article, otherAnswer],
): InfiniteData<{ items: FeedIdentitySource[]; nextUrl: string }, string> {
  return {
    pages: [
      { items, nextUrl: 'next-page' },
      { items: [answer], nextUrl: 'last-page' },
    ],
    pageParams: ['first-page', 'next-page'],
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  client.setQueryData(queryKey, pages());
  const host = await renderHook(
    ({ accountKey }: { accountKey: string | null }) =>
      useRecommendFeedback(accountKey),
    {
      initialProps: { accountKey: 'id:account-a' },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { client, host };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  mockCookies = 'synthetic-session';
  jest.mocked(markRecommendationUninterested).mockResolvedValue();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

test('feedback targets only supported, stable content identities', () => {
  expect(getRecommendFeedbackTarget(answer)).toEqual(answer);
  expect(getRecommendFeedbackTarget(article)).toEqual(article);
  for (const type of ['pins', 'questions', 'videos', 'answer', undefined]) {
    expect(getRecommendFeedbackTarget({ ...answer, type })).toBeNull();
  }
  expect(getRecommendFeedbackTarget({ ...answer, id: '  ' })).toBeNull();
  expect(
    getRecommendFeedbackTarget({ ...answer, isIdStable: false }),
  ).toBeNull();
});

test('cache removal preserves pagination, other content types and untouched references', () => {
  const original = pages();
  const result = removeRecommendationFromPages(original, 'answer:same-token');
  expect(result?.pages.map((page) => page.items)).toEqual([
    [article, otherAnswer],
    [],
  ]);
  expect(result?.pageParams).toBe(original.pageParams);
  expect(result?.pages.map((page) => page.nextUrl)).toEqual([
    'next-page',
    'last-page',
  ]);
  expect(original.pages[0].items).toHaveLength(3);
  expect(removeRecommendationFromPages(original, 'answer:missing')).toBe(
    original,
  );
});

test('successful feedback removes all recommendation variants for only its account and suppresses late responses', async () => {
  const { client, host } = await setup();
  const variant = [...queryKey.slice(0, 3), { includeDesktop: true }];
  const following = ['zhihu-feed', 'id:account-a', 'following', null];
  const accountB = ['zhihu-feed', 'id:account-b', 'recommend', {}];
  client.setQueryData(variant, pages());
  client.setQueryData(following, pages());
  client.setQueryData(accountB, pages());
  await act(async () => host.result.current.markUninterested(answer));
  expect(markRecommendationUninterested).toHaveBeenCalledWith(answer);
  for (const key of [queryKey, variant]) {
    expect(client.getQueryData(key)).toEqual(
      removeRecommendationFromPages(pages(), 'answer:same-token'),
    );
  }
  expect(client.getQueryData(following)).toEqual(pages());
  expect(client.getQueryData(accountB)).toEqual(pages());
  expect(host.result.current.filterRecommendations([answer, article])).toEqual([
    article,
  ]);
  expect(feedCacheRepository.removeFeedCacheItem).toHaveBeenCalledWith(
    { accountKey: 'id:account-a', feedType: 'recommend' },
    'answer:same-token',
  );
});

test('duplicate taps share one request and failed feedback preserves content for retry', async () => {
  const request = deferred();
  jest
    .mocked(markRecommendationUninterested)
    .mockReturnValueOnce(request.promise);
  const { client, host } = await setup();
  const first = host.result.current.markUninterested(answer);
  await host.result.current.markUninterested(answer);
  expect(markRecommendationUninterested).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(queryKey)).toEqual(pages());
  await act(async () => {
    request.reject(new Error('synthetic failure'));
    await first;
  });
  expect(client.getQueryData(queryKey)).toEqual(pages());
  expect(host.result.current.filterRecommendations([answer])).toEqual([answer]);
  expect(feedCacheRepository.removeFeedCacheItem).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('合成反馈错误');
  await act(async () => host.result.current.markUninterested(answer));
  expect(markRecommendationUninterested).toHaveBeenCalledTimes(2);
});

test('responses and queued menu callbacks from an old login session cannot change the current feed', async () => {
  const request = deferred();
  jest.mocked(markRecommendationUninterested).mockReturnValue(request.promise);
  const { client, host } = await setup();
  const oldAction = host.result.current.markUninterested;
  const pending = oldAction(answer);
  mockSessionVersion += 1;
  await host.rerender({ accountKey: 'id:account-b' });
  await act(async () => {
    request.resolve();
    await pending;
  });
  await oldAction(otherAnswer);
  expect(markRecommendationUninterested).toHaveBeenCalledTimes(1);
  expect(client.getQueryData(queryKey)).toEqual(pages());
  expect(feedCacheRepository.removeFeedCacheItem).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  expect(host.result.current.filterRecommendations([answer])).toEqual([answer]);
});

test('a concurrent refresh cannot restore content after feedback succeeds', async () => {
  const { client, host } = await setup();
  const refresh = deferred();
  const refreshed = client.fetchQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      void signal.aborted;
      await refresh.promise;
      return pages();
    },
  });
  void refreshed.catch(() => {});
  await act(async () => host.result.current.markUninterested(answer));
  await act(async () => refresh.resolve());
  expect(client.getQueryData(queryKey)).toEqual(
    removeRecommendationFromPages(pages(), 'answer:same-token'),
  );
});
