import { renderHook } from '@testing-library/react-native';
import { usePageQueue } from '../src/hooks/usePageQueue';

function setup() {
  const signals = new Map<string, AbortSignal>();
  const fetchPage = jest.fn(async (url: string, signal: AbortSignal) => {
    signals.set(url, signal);
    return url;
  });
  const options = {
    fetchPage,
    predict: (url: string, count: number) =>
      Array.from({ length: count }, (_, index) => `${url}+${index + 1}`),
    key: (url: string) => url,
    depth: 2,
  };
  return { fetchPage, signals, options };
}

test('a list restored with a next page starts the relay without a request of its own', async () => {
  const { fetchPage, options } = setup();
  const { result } = await renderHook(() =>
    usePageQueue(options, { enabled: true, nextUrl: 'p2' }),
  );
  expect(fetchPage.mock.calls.map(([url]) => url)).toEqual(['p2', 'p2+1']);
  await expect(result.current.take('p2')).resolves.toBe('p2');
  expect(fetchPage).toHaveBeenCalledTimes(2);
});

test('follows the next page as the list grows', async () => {
  const { options } = setup();
  const { result, rerender } = await renderHook(
    ({ nextUrl }: { nextUrl: string | null }) =>
      usePageQueue(options, { enabled: true, nextUrl }),
    { initialProps: { nextUrl: 'p2' } },
  );
  await rerender({ nextUrl: 'p3' });
  expect(result.current.pending).toEqual(['p3', 'p3+1']);
});

test('turning it off or unmounting aborts every queued request', async () => {
  const { options, signals } = setup();
  const { result, rerender, unmount } = await renderHook(
    ({ enabled }: { enabled: boolean }) =>
      usePageQueue(options, { enabled, nextUrl: 'p2' }),
    { initialProps: { enabled: true } },
  );
  await rerender({ enabled: false });
  expect(result.current.pending).toEqual([]);
  expect(signals.get('p2')?.aborted).toBe(true);

  await rerender({ enabled: true });
  await unmount();
  expect(signals.get('p2+1')?.aborted).toBe(true);
});

describe('around a pull-to-refresh, which keeps the old pages until it succeeds', () => {
  const relay = (fetchPage: jest.Mock) => ({
    fetchPage,
    key: (url: string) => url,
    depth: 1,
  });

  test('clearing the queue when a refresh starts requests the next page twice if the refresh fails', async () => {
    const fetchPage = jest.fn(async (url: string) => url);
    const { result, rerender } = await renderHook(
      ({ nextUrl }: { nextUrl: string }) =>
        usePageQueue(relay(fetchPage), { enabled: true, nextUrl }),
      { initialProps: { nextUrl: 'old-p2' } },
    );
    result.current.clear(); // what a refresh used to do first
    await rerender({ nextUrl: 'old-p2' }); // the failed refresh restores the pages
    await result.current.take('old-p2');
    expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([
      'old-p2',
      'old-p2',
    ]);
  });

  test('left alone, a failed refresh hands over the page already requested', async () => {
    const fetchPage = jest.fn(async (url: string) => url);
    const { result, rerender } = await renderHook(
      ({ nextUrl }: { nextUrl: string }) =>
        usePageQueue(relay(fetchPage), { enabled: true, nextUrl }),
      { initialProps: { nextUrl: 'old-p2' } },
    );
    await rerender({ nextUrl: 'old-p2' });
    await expect(result.current.take('old-p2')).resolves.toBe('old-p2');
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  test('left alone, a successful refresh aborts the old session page as the new one is queued', async () => {
    const signals = new Map<string, AbortSignal>();
    const fetchPage = jest.fn(async (url: string, signal: AbortSignal) => {
      signals.set(url, signal);
      return url;
    });
    const { result, rerender } = await renderHook(
      ({ nextUrl }: { nextUrl: string }) =>
        usePageQueue(relay(fetchPage), { enabled: true, nextUrl }),
      { initialProps: { nextUrl: 'old-p2' } },
    );
    await rerender({ nextUrl: 'new-p2' });
    expect(signals.get('old-p2')?.aborted).toBe(true);
    expect(result.current.pending).toEqual(['new-p2']);
  });
});
