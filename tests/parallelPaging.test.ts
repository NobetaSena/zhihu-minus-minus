import {
  fetchOffsetPages,
  RECOMMEND_QUEUE_DEPTH,
  recommendPageKey,
  shouldRelayRecommendations,
} from '../src/utils/parallelPaging';

jest.mock('../src/api/client', () => ({ __esModule: true, default: {} }));

type Item = { id: string; type: string };
type Page = { data: Item[]; paging: { is_end: boolean; next: string } };

const answers = (from: number, to: number): Item[] =>
  Array.from({ length: to - from }, (_, index) => ({
    id: String(from + index),
    type: 'answer',
  }));

function offsetSource(total: number, overshoot = 0) {
  return jest.fn(async (offset: number): Promise<Page> => {
    const end = Math.min(total, offset + 20 + overshoot);
    return {
      data: answers(offset, end),
      paging: {
        is_end: end >= total,
        next: `https://www.zhihu.com/api/v4/members/x/answers?offset=${offset + 20}`,
      },
    };
  });
}

test('requests consecutive offsets together and continues after the last', async () => {
  const fetchPage = offsetSource(200);
  const page = await fetchOffsetPages(fetchPage, 40, 20);
  expect(fetchPage.mock.calls.map(([offset]) => offset)).toEqual([40, 60, 80]);
  expect(page.data.map((item) => item.id)).toEqual(
    answers(40, 100).map((item) => item.id),
  );
  expect(page.paging.next).toContain('offset=100');
});

test('drops items repeated when Zhihu returns more than the limit', async () => {
  const page = await fetchOffsetPages(offsetSource(200, 17), 0, 20);
  const ids = page.data.map((item) => item.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toEqual(answers(0, 77).map((item) => item.id));
});

test('stops at the end and ignores pages requested past it', async () => {
  const page = await fetchOffsetPages(offsetSource(30), 0, 20);
  expect(page.data).toHaveLength(30);
  expect(page.paging.is_end).toBe(true);
});

test('keeps the pages before a failed one, and fails only with the first', async () => {
  const fetchPage = jest.fn(async (offset: number): Promise<Page> => {
    if (offset === 20) throw new Error('offline');
    return {
      data: answers(offset, offset + 20),
      paging: { is_end: false, next: `?offset=${offset + 20}` },
    };
  });
  const page = await fetchOffsetPages(fetchPage, 0, 20);
  expect(page.data).toHaveLength(20);
  expect(page.paging.next).toBe('?offset=20');
  fetchPage.mockRejectedValueOnce(new Error('first'));
  await expect(fetchOffsetPages(fetchPage, 0, 20)).rejects.toThrow('first');
});

const recommendUrl = (pageNumber: number, offset: number) =>
  `https://www.zhihu.com/api/v3/feed/topstory/recommend?action=down&after_id=${offset}&desktop=true&end_offset=${offset}&page_number=${pageNumber}&session_token=tok`;

test('the recommendation relay requests only the next page the server named', () => {
  // Later cursors may belong to the server's recommendation session, so they
  // are never guessed.
  expect(RECOMMEND_QUEUE_DEPTH).toBe(1);
});

test('the recommendation relay runs only when list preloading is off', () => {
  const signedIn = { tab: 'recommend', guest: false };
  expect(
    shouldRelayRecommendations({
      ...signedIn,
      parallelPaging: true,
      listPreload: false,
    }),
  ).toBe(true);
  // Preloading already requests the next page; the relay would add nothing.
  expect(
    shouldRelayRecommendations({
      ...signedIn,
      parallelPaging: true,
      listPreload: true,
    }),
  ).toBe(false);
  expect(
    shouldRelayRecommendations({
      ...signedIn,
      parallelPaging: false,
      listPreload: false,
    }),
  ).toBe(false);
  expect(
    shouldRelayRecommendations({
      tab: 'recommend',
      guest: true,
      parallelPaging: true,
      listPreload: false,
    }),
  ).toBe(false);
  expect(
    shouldRelayRecommendations({
      tab: 'following',
      guest: false,
      parallelPaging: true,
      listPreload: false,
    }),
  ).toBe(false);
});

test('an empty extra offset page is requested again on its own', async () => {
  const source = offsetSource(200);
  const fetchPage = jest.fn(
    async (offset: number): Promise<Page> =>
      offset === 40
        ? { data: [], paging: { is_end: true, next: '?offset=60' } }
        : source(offset),
  );
  const page = await fetchOffsetPages(fetchPage, 0, 20);
  expect(page.data).toHaveLength(40);
  expect(page.paging.is_end).toBe(false);
  expect(page.paging.next).toContain('offset=40');
});

test('a recommendation page is known by its session and cursor', () => {
  const page = recommendUrl(3, 11);
  expect(recommendPageKey(page.replace('https:', 'http:'))).toBe(
    recommendPageKey(page),
  );
  expect(recommendPageKey(recommendUrl(4, 17))).not.toBe(
    recommendPageKey(page),
  );
  expect(recommendPageKey(page.replace('tok', 'other'))).not.toBe(
    recommendPageKey(page),
  );
  expect(recommendPageKey('zhihu://local-feed')).toBe('zhihu://local-feed');
});
