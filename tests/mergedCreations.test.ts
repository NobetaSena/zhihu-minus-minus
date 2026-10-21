import type { ZhihuListResponse } from '../api/zhihu/member';
import type { ZhihuMemberRelation } from '../types/zhihu';
import {
  type CreationKind,
  type FetchCreations,
  fetchMergedCreationsPage,
  INITIAL_CREATIONS_CURSOR,
} from '../utils/mergedCreations';

jest.mock('../api/client', () => ({ __esModule: true, default: {} }));

/** Each source lists its items newest first, two per page. */
function sources(times: Record<CreationKind, number[]>) {
  const fetch = jest.fn<ReturnType<FetchCreations>, Parameters<FetchCreations>>(
    async (kind, offset) => {
      const data = times[kind].slice(offset, offset + 2).map(
        (time) =>
          ({
            id: `${kind}-${time}`,
            ...(kind === 'answers'
              ? { created_time: time }
              : { created: time }),
          }) as unknown as ZhihuMemberRelation,
      );
      const isEnd = offset + 2 >= times[kind].length;
      return {
        data,
        paging: {
          is_end: isEnd,
          is_start: offset === 0,
          next: `https://www.zhihu.com/api/v4/members/x/${kind}?offset=${offset + 2}`,
          previous: '',
          totals: times[kind].length,
        },
      } as ZhihuListResponse<ZhihuMemberRelation>;
    },
  );
  return fetch;
}

const ids = (page: { data: { item: ZhihuMemberRelation }[] }) =>
  page.data.map(({ item }) => item.id);

test('interleaves answers, articles and pins newest first across pages', async () => {
  const fetch = sources({
    answers: [90, 70, 40, 10],
    articles: [80, 30],
    pins: [60, 50, 20],
  });
  const first = await fetchMergedCreationsPage(
    INITIAL_CREATIONS_CURSOR,
    fetch,
    5,
  );
  expect(ids(first)).toEqual([
    'answers-90',
    'articles-80',
    'answers-70',
    'pins-60',
    'pins-50',
  ]);
  if (!first.next) throw new Error('more creations remain');
  const second = await fetchMergedCreationsPage(first.next, fetch, 5);
  expect(ids(second)).toEqual([
    'answers-40',
    'articles-30',
    'pins-20',
    'answers-10',
  ]);
  expect(second.next).toBeUndefined();
});

test('fetches the next page of a source before passing over it', async () => {
  // Answers' second page is newer than every article; it must be read first.
  const fetch = sources({
    answers: [100, 99, 98, 97],
    articles: [50, 40],
    pins: [],
  });
  const page = await fetchMergedCreationsPage(
    INITIAL_CREATIONS_CURSOR,
    fetch,
    4,
  );
  expect(ids(page)).toEqual([
    'answers-100',
    'answers-99',
    'answers-98',
    'answers-97',
  ]);
  expect(fetch).toHaveBeenCalledWith('answers', 2);
});

test('does not mutate the cursor it was given', async () => {
  const fetch = sources({ answers: [3, 2, 1], articles: [], pins: [] });
  const first = await fetchMergedCreationsPage(
    INITIAL_CREATIONS_CURSOR,
    fetch,
    1,
  );
  expect(INITIAL_CREATIONS_CURSOR.answers).toEqual({
    offset: 0,
    ended: false,
    buffer: [],
  });
  if (!first.next) throw new Error('more creations remain');
  const snapshot = JSON.stringify(first.next);
  await fetchMergedCreationsPage(first.next, fetch, 1);
  expect(JSON.stringify(first.next)).toBe(snapshot);
});
