/** With 多页同时加载 on, offset-paged lists request this many pages at once. */
export const PARALLEL_PAGE_COUNT = 3;

interface Page<T> {
  data: T[];
  paging?: { is_end?: boolean; next?: string | null };
}

function identity(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return undefined;
  const record = item as {
    id?: unknown;
    type?: unknown;
    target?: { id?: unknown; type?: unknown };
  };
  const id = record.target?.id ?? record.id;
  if (id === undefined || id === null || id === '') return undefined;
  return `${String(record.target?.type ?? record.type ?? '')}:${String(id)}`;
}

/**
 * Join consecutive pages into one, dropping items an earlier page already had
 * (Zhihu repeats items across pages). The joined page continues from the last
 * page kept.
 */
export function joinPages<T, P extends Page<T>>(pages: P[]): P {
  const seen = new Set<string>();
  const data = pages.flatMap((page) =>
    page.data.filter((item) => {
      const key = identity(item);
      if (key === undefined) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return { ...pages[pages.length - 1], data };
}

/**
 * Offset-paged lists (`/members/{id}/answers` and the like) name every page by
 * its offset, so the next pages can be requested together. Pages after the end
 * or after a failed request are dropped, and so is an empty extra page: its
 * `is_end` would otherwise end the list early, and the page after the last
 * kept one is requested on its own next time. The first page's failure is the
 * request's failure.
 */
export async function fetchOffsetPages<T, P extends Page<T>>(
  fetchPage: (offset: number) => Promise<P>,
  offset: number,
  limit: number,
  count = PARALLEL_PAGE_COUNT,
): Promise<P> {
  const [first, ...settled] = await Promise.allSettled(
    Array.from({ length: count }, (_, index) =>
      fetchPage(offset + index * limit),
    ),
  );
  if (first.status === 'rejected') throw first.reason;
  const pages = [first.value];
  for (const result of settled) {
    const previous = pages[pages.length - 1];
    if (
      previous.paging?.is_end ||
      result.status !== 'fulfilled' ||
      result.value.data.length === 0
    )
      break;
    pages.push(result.value);
  }
  return joinPages<T, P>(pages);
}

const RECOMMEND_PATH = '/api/v3/feed/topstory/recommend';
const RECOMMEND_CURSOR_KEYS = [
  'page_number',
  'after_id',
  'end_offset',
] as const;

/**
 * With 多页同时加载 on, recommendation requests kept in flight ahead of the
 * list: only the next page, by the URL the previous page named. The cursor in
 * that URL may carry the server's recommendation session, so later pages are
 * never guessed or requested out of order; the server sees the same requests
 * in the same order as without the switch, only sooner.
 */
export const RECOMMEND_QUEUE_DEPTH = 1;

/**
 * Identity of a recommendation page: its session and cursor, whatever the
 * scheme (`next` arrives as http) or parameter order. Other URLs are their own
 * identity.
 */
export function recommendPageKey(url: string): string {
  try {
    const parsed = new URL(url);
    const session = parsed.searchParams.get('session_token');
    if (parsed.pathname.endsWith(RECOMMEND_PATH) && session)
      return [
        'recommend',
        session,
        ...RECOMMEND_CURSOR_KEYS.map((key) => parsed.searchParams.get(key)),
      ].join(':');
  } catch {
    // Not an absolute URL: fall back to the text itself.
  }
  return url;
}
