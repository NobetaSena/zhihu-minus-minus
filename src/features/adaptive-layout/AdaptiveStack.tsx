import {
  createStandardRouterNavigator,
  type Href,
  type NavigatorContentProps,
  Stack,
} from 'expo-router';
import type {
  NativeStackNavigationEventMap,
  NativeStackNavigationOptions,
} from 'expo-router/native-stack';
import {
  Header,
  HeaderBackButton,
  HeaderHeightContext,
  HeaderShownContext,
  type NavigationAction,
  SafeAreaProviderCompat,
} from 'expo-router/react-navigation';
import {
  type ComponentProps,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Dimensions,
  Keyboard,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import {
  canUseTwoPanes,
  getListPaneWidth,
  getVisiblePanes,
  PANE_DIVIDER_WIDTH,
} from './layout';
import { PaneContext, usePaneDimensions } from './PaneContext';
import { PaneStackRouter } from './PaneStackRouter';
import { resolvePaneDetailHref } from './selection';
import { PaneSelectionContext } from './usePaneRouter';

type StackEvents = {
  [K in keyof NativeStackNavigationEventMap]: NativeStackNavigationEventMap[K] & {
    canPreventDefault: false;
  };
};
type ContentProps = NavigatorContentProps<
  NativeStackNavigationOptions,
  StackEvents,
  object,
  {
    dispatchNavigation: (action: NavigationAction) => void;
    navigatorKey: string;
  }
>;

export function AdaptiveStackContent({
  state,
  descriptors,
  actions,
  dispatchNavigation,
  navigatorKey,
}: ContentProps) {
  const dimensions = useWindowDimensions();
  const colors = useRuntimeThemeColors();
  const enabled = useSettingsStore((s) => s.enableLargeScreenLayout);
  const savedRatio = useSettingsStore((s) => s.largeScreenListRatio);
  const [ratio, setRatio] = useState(savedRatio);
  const [measurement, setMeasurement] = useState<{
    width: number;
    height: number;
    windowWidth: number;
    windowHeight: number;
  } | null>(null);
  // Ignore the old container measurement immediately when the window changes.
  const size =
    measurement?.windowWidth === dimensions.width &&
    measurement.windowHeight === dimensions.height
      ? measurement
      : null;
  useEffect(() => setRatio(savedRatio), [savedRatio]);
  const width = size?.width ?? dimensions.width;
  const height = size?.height ?? dimensions.height;
  const wide = canUseTwoPanes(width, height, enabled);
  const panes = getVisiblePanes(state.routes, state.index, wide);
  const selectDetail = useCallback(
    (sourceKey: string, href: Href) => {
      if (!wide || sourceKey !== panes.listKey) return false;
      const destination = resolvePaneDetailHref(href);
      if (!destination) return false;
      // A list selection opens one answer, irrespective of the phone reading mode.
      if (destination.name === 'answer/[id]')
        destination.params.readingMode = 'detail';
      dispatchNavigation({
        type: 'PUSH',
        target: navigatorKey,
        payload: { ...destination, paneSelectionSource: sourceKey },
      });
      return true;
    },
    [wide, panes.listKey, dispatchNavigation, navigatorKey],
  );
  const listWidth = getListPaneWidth(width, ratio);
  const detailLeft = listWidth + PANE_DIVIDER_WIDTH;
  const drag = useRef({ width, ratio, start: listWidth });
  drag.current.width = width;
  drag.current.ratio = ratio;
  const divider = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.current.start = getListPaneWidth(
          drag.current.width,
          drag.current.ratio,
        );
      },
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(
          0.6,
          Math.max(
            0.2,
            (drag.current.start + gesture.dx) /
              (drag.current.width - PANE_DIVIDER_WIDTH),
          ),
        );
        drag.current.ratio = next;
        setRatio(next);
      },
      onPanResponderRelease: () =>
        useSettingsStore
          .getState()
          .updateSettings({ largeScreenListRatio: drag.current.ratio }),
      onPanResponderTerminate: () =>
        setRatio(useSettingsStore.getState().largeScreenListRatio),
    }),
  ).current;

  return (
    <PaneSelectionContext.Provider value={selectDetail}>
      <View
        style={[styles.container, { backgroundColor: colors.background }]}
        testID="adaptive-stack"
        onLayout={({ nativeEvent: { layout } }) => {
          if (layout.width > 0 && layout.height > 0) {
            setMeasurement((previous) =>
              previous?.width === layout.width &&
              previous.height === layout.height &&
              previous.windowWidth === dimensions.width &&
              previous.windowHeight === dimensions.height
                ? previous
                : {
                    width: layout.width,
                    height: layout.height,
                    windowWidth: dimensions.width,
                    windowHeight: dimensions.height,
                  },
            );
          }
        }}
      >
        {panes.listKey && !panes.detailKey ? (
          <View
            style={[styles.empty, { left: detailLeft }]}
            testID="adaptive-empty-detail"
          >
            <Text style={{ color: colors.textSecondary }}>选择左侧内容</Text>
          </View>
        ) : null}
        {state.routes.map((route, index) => {
          const descriptor = descriptors[route.key];
          const isList = route.key === panes.listKey;
          const isDetail = route.key === panes.detailKey;
          const visible = isList || isDetail || route.key === panes.fullKey;
          const paneWidth = isList
            ? listWidth
            : isDetail
              ? width - detailLeft
              : width;
          return (
            <RoutePane
              key={route.key}
              routeKey={route.key}
              twoPane={wide}
              testID={`adaptive-route-${route.key}`}
              left={isDetail ? detailLeft : 0}
              width={paneWidth}
              height={height}
              visible={visible}
            >
              <AdaptiveScreen
                options={descriptor.options}
                canGoBack={state.index > 0}
                onBack={actions.back}
                previousTitle={
                  descriptors[state.routes[index - 1]?.key]?.options.title
                }
              >
                {descriptor.render()}
              </AdaptiveScreen>
            </RoutePane>
          );
        })}
        {panes.listKey ? (
          <View
            {...divider.panHandlers}
            testID="adaptive-divider"
            accessibilityRole="adjustable"
            accessibilityLabel="调整列表宽度"
            accessibilityValue={{
              min: 20,
              max: 60,
              now: Math.round(ratio * 100),
            }}
            accessibilityActions={[
              { name: 'increment' },
              { name: 'decrement' },
            ]}
            onAccessibilityAction={({ nativeEvent }) => {
              const next = Math.min(
                0.6,
                Math.max(
                  0.2,
                  ratio +
                    (nativeEvent.actionName === 'increment' ? 0.05 : -0.05),
                ),
              );
              setRatio(next);
              useSettingsStore
                .getState()
                .updateSettings({ largeScreenListRatio: next });
            }}
            style={[
              styles.divider,
              { left: listWidth, backgroundColor: colors.background },
            ]}
          >
            <View
              style={{
                width: 1,
                height: '100%',
                backgroundColor: colors.border,
              }}
            />
          </View>
        ) : null}
      </View>
    </PaneSelectionContext.Provider>
  );
}

function RoutePane({
  routeKey,
  twoPane,
  testID,
  left,
  width,
  height,
  visible,
  children,
}: {
  routeKey: string;
  twoPane: boolean;
  testID: string;
  left: number;
  width: number;
  height: number;
  visible: boolean;
  children: ReactNode;
}) {
  const focused = useRef(false);
  useEffect(() => {
    if (!visible && focused.current) {
      focused.current = false;
      Keyboard.dismiss();
    }
  }, [visible]);
  // Keep native ScrollView/Pager geometry while covered. Collapsing a screen or
  // pausing its effects can reset scroll offsets, refreshes and header state.
  const [lastFrame, setLastFrame] = useState({ width, height, left });
  if (
    visible &&
    (lastFrame.width !== width ||
      lastFrame.height !== height ||
      lastFrame.left !== left)
  ) {
    setLastFrame({ width, height, left });
  }
  const frame = visible ? { width, height, left } : lastFrame;
  // Stable identity matters: route-level Stack.Screen updates options in a layout
  // effect. Recreating this value on each descriptor update causes a render loop.
  const value = useMemo(
    () => ({
      width: frame.width,
      height: frame.height,
      visible,
      routeKey,
      twoPane,
    }),
    [frame.width, frame.height, visible, routeKey, twoPane],
  );
  const webProps = Platform.OS === 'web' ? { inert: !visible } : {};
  return (
    <View
      {...webProps}
      testID={testID}
      onFocusCapture={() => {
        focused.current = true;
      }}
      onBlurCapture={() => {
        focused.current = false;
      }}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[styles.route, frame, { opacity: visible ? 1 : 0 }]}
    >
      <PaneContext.Provider value={value}>
        <SafeAreaProviderCompat>{children}</SafeAreaProviderCompat>
      </PaneContext.Provider>
    </View>
  );
}

function AdaptiveScreen({
  options,
  children,
  onBack,
  canGoBack,
  previousTitle,
}: {
  options: NativeStackNavigationOptions;
  children: React.ReactNode;
  onBack: () => void;
  canGoBack: boolean;
  previousTitle?: string;
}) {
  const insets = useSafeAreaInsets();
  const dimensions = usePaneDimensions();
  const colors = useRuntimeThemeColors();
  const [headerHeight, setHeaderHeight] = useState(56 + insets.top);
  const shown = options.headerShown !== false;
  const tintColor = options.headerTintColor ?? colors.primary;
  const itemProps = { tintColor, canGoBack };
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {shown ? (
        <View
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        >
          <Header
            layout={dimensions}
            title={options.title ?? ''}
            headerTitle={options.headerTitle}
            headerTitleStyle={options.headerTitleStyle}
            headerStyle={options.headerStyle}
            headerTintColor={tintColor}
            headerShadowVisible={options.headerShadowVisible}
            headerLeft={
              options.headerLeft
                ? () =>
                    options.headerLeft?.({ ...itemProps, label: previousTitle })
                : canGoBack
                  ? () => (
                      <HeaderBackButton
                        onPress={onBack}
                        tintColor={tintColor}
                        displayMode="minimal"
                        accessibilityLabel="返回"
                      />
                    )
                  : undefined
            }
            headerRight={
              options.headerRight
                ? () => options.headerRight?.(itemProps)
                : undefined
            }
          />
        </View>
      ) : null}
      <HeaderShownContext.Provider value={shown}>
        <HeaderHeightContext.Provider value={shown ? headerHeight : 0}>
          <View style={styles.container}>{children}</View>
        </HeaderHeightContext.Provider>
      </HeaderShownContext.Provider>
    </View>
  );
}

export const TwoPaneStack = createStandardRouterNavigator(
  AdaptiveStackContent,
  PaneStackRouter,
  {
    createProps: ({ dispatch, state }) => ({
      dispatchNavigation: dispatch,
      navigatorKey: state.key,
    }),
  },
);

/** Choose the host once: rotating or disabling the preference must not remount it. */
function AdaptiveStackHost(props: ComponentProps<typeof Stack>) {
  const [capable] = useState(() => {
    const screen = Dimensions.get('screen');
    return (
      Platform.OS === 'web' ||
      (Platform.OS === 'ios' && Platform.isPad) ||
      Math.min(screen.width, screen.height) >= 600
    );
  });
  return capable ? (
    <TwoPaneStack {...props} activityEnabled={false} />
  ) : (
    <Stack {...props} />
  );
}

export const AdaptiveStack = Object.assign(AdaptiveStackHost, {
  Screen: Stack.Screen,
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  route: { position: 'absolute', top: 0, overflow: 'hidden' },
  empty: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: PANE_DIVIDER_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
