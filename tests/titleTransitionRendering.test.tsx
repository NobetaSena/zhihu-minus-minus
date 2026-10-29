import { act, fireEvent, render } from '@testing-library/react-native';
import { useRef, useState } from 'react';
import { Animated, Text, View, type ViewInstance } from 'react-native';
import {
  TitleTransitionProvider,
  TitleTransitionTarget,
  useTitleTransition,
} from '../src/features/adaptive-layout/TitleTransition';

jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  const react = jest.requireActual('react');
  const ViewWithMeasurement = react.forwardRef(
    (props: object, ref: unknown) => {
      react.useImperativeHandle(ref, () => ({
        measureInWindow: (callback: (...args: number[]) => void) =>
          callback(20, 80, 180, 24),
      }));
      return react.createElement(native.View, props);
    },
  );
  return new Proxy(native, {
    get: (target, key) => (key === 'View' ? ViewWithMeasurement : target[key]),
  });
});

jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({ text: '#111' }),
}));

function Example() {
  const ref = useRef<ViewInstance>(null);
  const [opened, setOpened] = useState(false);
  const transition = useTitleTransition();
  return opened ? (
    <TitleTransitionTarget id="question-1">
      <Text>详情标题</Text>
    </TitleTransitionTarget>
  ) : (
    <View ref={ref}>
      <Text
        onPress={() =>
          transition(ref, 'question-1', '卡片标题', () => setOpened(true))
        }
      >
        打开
      </Text>
    </View>
  );
}

test('a measured matching destination starts a temporary title handoff', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  const host = await render(
    <TitleTransitionProvider activeRouteKey="source">
      <Example />
    </TitleTransitionProvider>,
  );
  await fireEvent.press(host.getByText('打开'));
  await host.rerender(
    <TitleTransitionProvider activeRouteKey="destination">
      <Example />
    </TitleTransitionProvider>,
  );
  const target = host.getByText('详情标题').parent;
  expect(target).not.toBeNull();
  await act(() => {
    if (target)
      fireEvent(target, 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 180, height: 24 } },
      });
  });
  expect(
    host.getByText('卡片标题', { includeHiddenElements: true }),
  ).toBeTruthy();
  await host.rerender(
    <TitleTransitionProvider activeRouteKey="source">
      <Example />
    </TitleTransitionProvider>,
  );
  expect(
    host.queryByText('卡片标题', { includeHiddenElements: true }),
  ).toBeNull();
  timing.mockRestore();
});
