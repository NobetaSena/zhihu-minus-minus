import {
  fetchOffsetPages,
  fetchRecommendPages,
  predictRecommendUrls,
} from '../utils/parallelPaging';

jest.mock('../api/client', () => ({ __esModule: true, default: {} }));

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

/** Behaves like the Web recommendation feed: six items, cursor in `next`. */
function recommendSource(shift = 6) {
  return jest.fn(async (url: string): Promise<Page> => {
    const parsed = new URL(url);
    const pageNumber = Number(parsed.searchParams.get('page_number'));
    const offset = Number(parsed.searchParams.get('end_offset'));
    return {
      data: answers(offset, offset + 6),
      paging: {
        is_end: false,
        next: recommendUrl(pageNumber + 1, offset + shift),
      },
    };
  });
}

test('predicts the following recommendation pages from the cursor', () => {
  expect(predictRecommendUrls(recommendUrl(2, 5), 2, 6)).toEqual([
    recommendUrl(3, 11),
    recommendUrl(4, 17),
  ]);
  expect(
    predictRecommendUrls('https://api.zhihu.com/topstory/recommend', 2, 6),
  ).toBeUndefined();
});

test('joins predicted recommendation pages that continue the cursor', async () => {
  const fetchPage = recommendSource();
  const page = await fetchRecommendPages(fetchPage, recommendUrl(2, 5));
  expect(fetchPage).toHaveBeenCalledTimes(3);
  expect(page.data).toHaveLength(18);
  expect(page.paging.next).toBe(recommendUrl(5, 23));
});

test('falls back to one page when the cursor no longer follows the pattern', async () => {
  const page = await fetchRecommendPages(
    recommendSource(10),
    recommendUrl(2, 5),
  );
  expect(page.data).toHaveLength(6);
  expect(page.paging.next).toBe(recommendUrl(3, 15));
});
