import type { ZhihuListResponse } from '@/api/zhihu/member';
import type { ZhihuMemberRelation } from '@/types/zhihu';
import { getNextPageOffset } from '@/utils/userProfile';

/** 「创作」合并的三类内容，与个人主页同名 tab 一致。 */
export const CREATION_KINDS = ['answers', 'articles', 'pins'] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

export interface MergedCreation {
  kind: CreationKind;
  item: ZhihuMemberRelation;
}

interface SourceCursor {
  offset: number;
  ended: boolean;
  /** Fetched but not yet shown, newest first. */
  buffer: ZhihuMemberRelation[];
}

export type MergedCreationsCursor = Record<CreationKind, SourceCursor>;

export interface MergedCreationsPage {
  data: MergedCreation[];
  next: MergedCreationsCursor | undefined;
}

export type FetchCreations = (
  kind: CreationKind,
  offset: number,
) => Promise<ZhihuListResponse<ZhihuMemberRelation>>;

export const INITIAL_CREATIONS_CURSOR: MergedCreationsCursor = {
  answers: { offset: 0, ended: false, buffer: [] },
  articles: { offset: 0, ended: false, buffer: [] },
  pins: { offset: 0, ended: false, buffer: [] },
};

export function getCreationTime(item: ZhihuMemberRelation): number {
  const record = item as { created_time?: unknown; created?: unknown };
  const time = record.created_time ?? record.created;
  return typeof time === 'number' && Number.isFinite(time) ? time : 0;
}

/**
 * 知乎没有「全部创作」接口：分别翻回答、文章、想法三个按时间倒序的列表，
 * 再归并成一条时间线。某一类的缓冲用完而它还有下一页时先补齐，
 * 保证每次取出的都是三类里真正最新的一条。
 */
export async function fetchMergedCreationsPage(
  cursor: MergedCreationsCursor,
  fetchCreations: FetchCreations,
  pageSize: number,
): Promise<MergedCreationsPage> {
  const sources = Object.fromEntries(
    CREATION_KINDS.map((kind) => [
      kind,
      { ...cursor[kind], buffer: [...cursor[kind].buffer] },
    ]),
  ) as MergedCreationsCursor;

  const refill = async (kind: CreationKind) => {
    const source = sources[kind];
    const page = await fetchCreations(kind, source.offset);
    const next = page.paging?.is_end
      ? undefined
      : getNextPageOffset(page.paging?.next);
    source.buffer.push(...page.data);
    source.ended =
      page.data.length === 0 || next === undefined || next <= source.offset;
    if (next !== undefined) source.offset = next;
  };

  const data: MergedCreation[] = [];
  while (data.length < pageSize) {
    const empty = CREATION_KINDS.filter(
      (kind) => sources[kind].buffer.length === 0 && !sources[kind].ended,
    );
    if (empty.length > 0) {
      await Promise.all(empty.map(refill));
      continue;
    }
    let newest: CreationKind | undefined;
    for (const kind of CREATION_KINDS) {
      const head = sources[kind].buffer[0];
      if (
        head &&
        (!newest ||
          getCreationTime(head) > getCreationTime(sources[newest].buffer[0]))
      )
        newest = kind;
    }
    if (!newest) break;
    const item = sources[newest].buffer.shift();
    if (item) data.push({ kind: newest, item });
  }

  const exhausted = CREATION_KINDS.every(
    (kind) => sources[kind].ended && sources[kind].buffer.length === 0,
  );
  return { data, next: exhausted ? undefined : sources };
}
