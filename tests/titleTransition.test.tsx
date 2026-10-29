import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode, RefObject } from 'react';
import type { ViewInstance } from 'react-native';
import {
  TitleTransitionProvider,
  useTitleTransition,
} from '../src/features/adaptive-layout/TitleTransition';

jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({ text: '#111' }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <TitleTransitionProvider>{children}</TitleTransitionProvider>;
}

function measuredRef() {
  let complete:
    | ((x: number, y: number, width: number, height: number) => void)
    | undefined;
  const ref = {
    current: {
      measureInWindow: (callback: typeof complete) => {
        complete = callback;
      },
    },
  } as unknown as RefObject<ViewInstance | null>;
  return { ref, complete: () => complete?.(10, 20, 120, 24) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('opens exactly once after measuring the tapped title', async () => {
  const { result } = await renderHook(() => useTitleTransition(), { wrapper });
  const source = measuredRef();
  const open = jest.fn();
  await act(() => result.current(source.ref, 'question-1', '问题', open));
  expect(open).not.toHaveBeenCalled();
  await act(() => source.complete());
  await act(() => jest.advanceTimersByTime(200));
  expect(open).toHaveBeenCalledTimes(1);
});

test('still opens if the source cannot be measured', async () => {
  const { result } = await renderHook(() => useTitleTransition(), { wrapper });
  const source = measuredRef();
  const open = jest.fn();
  await act(() => result.current(source.ref, 'question-1', '问题', open));
  await act(() => jest.advanceTimersByTime(100));
  await act(() => source.complete());
  expect(open).toHaveBeenCalledTimes(1);
});

test('a later tap cancels the earlier pending measurement', async () => {
  const { result } = await renderHook(() => useTitleTransition(), { wrapper });
  const first = measuredRef();
  const second = measuredRef();
  const openFirst = jest.fn();
  const openSecond = jest.fn();
  await act(() => result.current(first.ref, 'one', '第一个', openFirst));
  await act(() => result.current(second.ref, 'two', '第二个', openSecond));
  await act(() => first.complete());
  await act(() => second.complete());
  await act(() => jest.advanceTimersByTime(200));
  expect(openFirst).not.toHaveBeenCalled();
  expect(openSecond).toHaveBeenCalledTimes(1);
});
