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
  Children,
  type ComponentProps,
  createElement,
  isValidElement,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
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
  getListPaneWidth,
  getVisiblePanes,
  PANE_DIVIDER_WIDTH,
} from './layout';
import { PaneContext, usePaneDimensions } from './PaneContext';
import { PaneDivider } from './PaneDivider';
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
  const panes = getVisiblePanes(state.routes, state.index, enabled);
  const selectDetail = useCallback(
    (sourceKey: string, href: Href) => {
      if (!enabled || sourceKey !== panes.listKey) return false;
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
    [enabled, panes.listKey, dispatchNavigation, navigatorKey],
  );
  const listWidth = getListPaneWidth(width, ratio);
  const detailLeft = listWidth + PANE_DIVIDER_WIDTH;
  const commitRatio = useCallback((next: number) => {
    setRatio(next);
    useSettingsStore.getState().updateSettings({ largeScreenListRatio: next });
  }, []);
  const cancelResize = useCallback(() => {
    setRatio(useSettingsStore.getState().largeScreenListRatio);
  }, []);

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
              twoPane={!!panes.listKey}
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
          <PaneDivider
            width={width}
            ratio={ratio}
            onChange={setRatio}
            onCommit={commitRatio}
            onCancel={cancelResize}
          />
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

function AdaptiveStackHost(props: ComponentProps<typeof Stack>) {
  // Expo's native Stack unwraps Stack.Screen itself. A standard navigator
  // instead expects its own Screen marker when reading layout options.
  const adaptiveChildren = useMemo(
    () =>
      Children.map(props.children, (child) =>
        isValidElement<ComponentProps<typeof Stack.Screen>>(child) &&
        child.type === Stack.Screen
          ? createElement(TwoPaneStack.Screen, {
              ...child.props,
              key: child.key,
            })
          : child,
      ),
    [props.children],
  );
  return (
    <TwoPaneStack {...props} activityEnabled={false}>
      {adaptiveChildren}
    </TwoPaneStack>
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
});
