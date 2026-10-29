import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  type LayoutChangeEvent,
  StyleSheet,
  View,
  type ViewInstance,
} from 'react-native';
import { useRuntimeThemeColors } from '@/components/Themed';
import { useSettingsStore } from '@/store/useSettingsStore';
import { PaneContext, usePaneVisible } from './PaneContext';

type Frame = { x: number; y: number; width: number; height: number };
type PendingTitle = {
  id: string;
  text: string;
  source: Frame;
  expires: number;
  isValid?: () => boolean;
  destinationKey?: string;
  sourceRouteKey?: string;
  rootX: number;
  rootY: number;
  measuring: boolean;
};
type Flight = {
  text: string;
  source: Frame;
  target: Frame;
  moving: boolean;
  token: number;
};
type TitleTransition = {
  navigate: (
    ref: RefObject<ViewInstance | null>,
    id: string,
    text: string,
    navigate: () => void,
    isValid?: () => boolean,
  ) => void;
  target: (id: string, ref: ViewInstance | null) => void;
};

const Context = createContext<TitleTransition | null>(null);
const VisibilityContext = createContext<{
  id: string;
  sourceRouteKey?: string;
  activeRouteKey?: string;
} | null>(null);
const TARGET_WAIT_MS = 200;
const validFrame = (frame: Frame) =>
  Number.isFinite(frame.x) &&
  Number.isFinite(frame.y) &&
  Number.isFinite(frame.width) &&
  Number.isFinite(frame.height) &&
  frame.width > 0 &&
  frame.height > 0;

/** Only an explicitly tapped title can start a flight; missing layout falls back to navigation. */
export function TitleTransitionProvider({
  children,
  activeRouteKey,
}: {
  children: ReactNode;
  activeRouteKey?: string;
}) {
  const root = useRef<ViewInstance>(null);
  const pending = useRef<PendingTitle | null>(null);
  const targetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sequence = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useRef(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [waiting, setWaiting] = useState<{
    id: string;
    sourceRouteKey?: string;
  } | null>(null);
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const previousRoute = useRef(activeRouteKey);
  const currentRoute = useRef(activeRouteKey);
  currentRoute.current = activeRouteKey;
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);

  useLayoutEffect(() => {
    if (previousRoute.current === activeRouteKey) return;
    previousRoute.current = activeRouteKey;
    if (pending.current && !pending.current.destinationKey) {
      pending.current.destinationKey = activeRouteKey;
    } else if (flightRef.current || pending.current) {
      sequence.current += 1;
      pending.current = null;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      progress.stopAnimation();
      setFlight(null);
      setWaiting(null);
    }
  }, [activeRouteKey, progress]);

  useEffect(() => {
    let mounted = true;
    const updateReducedMotion = (enabled: boolean) => {
      reducedMotion.current = enabled;
      if (enabled && (pending.current || flightRef.current)) {
        sequence.current += 1;
        pending.current = null;
        if (targetTimer.current) clearTimeout(targetTimer.current);
        targetTimer.current = null;
        progress.stopAnimation();
        setFlight(null);
        setWaiting(null);
      }
    };
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) updateReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      updateReducedMotion,
    );
    return () => {
      mounted = false;
      sequence.current += 1;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      subscription.remove();
    };
  }, [progress]);

  const navigate = useCallback<TitleTransition['navigate']>(
    (ref, id, text, open, isValid) => {
      const token = ++sequence.current;
      pending.current = null;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      progress.stopAnimation();
      setFlight(null);
      setWaiting(null);
      if (
        !id ||
        !text ||
        reducedMotion.current ||
        !ref.current ||
        !root.current
      ) {
        open();
        return;
      }
      let completed = false;
      const finish = (source?: Frame, rootX = 0, rootY = 0) => {
        if (completed || token !== sequence.current) return;
        completed = true;
        clearTimeout(timeout);
        if (
          source &&
          validFrame(source) &&
          !reducedMotion.current &&
          (!isValid || isValid())
        ) {
          pending.current = {
            id,
            text,
            source,
            expires: Date.now() + TARGET_WAIT_MS,
            isValid,
            sourceRouteKey: currentRoute.current,
            rootX,
            rootY,
            measuring: false,
          };
          const relative = {
            ...source,
            x: source.x - rootX,
            y: source.y - rootY,
          };
          progress.setValue(0);
          setWaiting({ id, sourceRouteKey: currentRoute.current });
          setFlight({
            text,
            source: relative,
            target: relative,
            moving: false,
            token,
          });
          targetTimer.current = setTimeout(() => {
            if (token !== sequence.current) return;
            pending.current = null;
            targetTimer.current = null;
            setWaiting(null);
            setFlight(null);
          }, TARGET_WAIT_MS);
        }
        open();
      };
      const timeout = setTimeout(() => finish(), 100);
      ref.current.measureInWindow((x, y, width, height) => {
        root.current?.measureInWindow((rootX, rootY) => {
          if (!Number.isFinite(rootX) || !Number.isFinite(rootY)) finish();
          else finish({ x, y, width, height }, rootX, rootY);
        });
      });
    },
    [progress],
  );

  const target = useCallback<TitleTransition['target']>((id, ref) => {
    const current = pending.current;
    if (!current || current.id !== id || !ref || current.measuring) return;
    if (
      Date.now() > current.expires ||
      reducedMotion.current ||
      (current.isValid && !current.isValid())
    ) {
      pending.current = null;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      setWaiting(null);
      setFlight(null);
      return;
    }
    current.measuring = true;
    const token = sequence.current;
    ref.measureInWindow((x, y, width, height) => {
      const destination = { x, y, width, height };
      if (
        !validFrame(destination) ||
        token !== sequence.current ||
        pending.current !== current ||
        Date.now() > current.expires ||
        (current.isValid && !current.isValid())
      )
        return;
      if (targetTimer.current) clearTimeout(targetTimer.current);
      targetTimer.current = null;
      setFlight({
        text: current.text,
        source: {
          ...current.source,
          x: current.source.x - current.rootX,
          y: current.source.y - current.rootY,
        },
        target: {
          ...destination,
          x: destination.x - current.rootX,
          y: destination.y - current.rootY,
        },
        moving: true,
        token,
      });
    });
  }, []);

  useLayoutEffect(() => {
    if (!flight?.moving) return;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && flight.token === sequence.current) {
        pending.current = null;
        setWaiting(null);
        setFlight(null);
      }
    });
    return () => animation.stop();
  }, [flight, progress]);

  const api = useMemo(() => ({ navigate, target }), [navigate, target]);
  const visibility = useMemo(
    () => (waiting ? { ...waiting, activeRouteKey } : null),
    [waiting, activeRouteKey],
  );

  return (
    <Context.Provider value={api}>
      <VisibilityContext.Provider value={visibility}>
        <View ref={root} collapsable={false} style={styles.root}>
          {children}
          {flight ? (
            <Animated.Text
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              numberOfLines={2}
              style={[
                styles.title,
                {
                  color: colors.text,
                  fontSize: 18 * fontSizeScale,
                  lineHeight: (24 * fontSizeScale * lineHeightScale) / 1.5,
                  left: flight.source.x,
                  top: flight.source.y,
                  width: flight.source.width,
                  opacity: progress.interpolate({
                    inputRange: [0, 0.7, 1],
                    outputRange: [1, 1, 0],
                  }),
                  transform: [
                    {
                      translateX: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          flight.target.x -
                            flight.source.x +
                            flight.source.width * 0.1,
                        ],
                      }),
                    },
                    {
                      translateY: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          0,
                          flight.target.y -
                            flight.source.y +
                            flight.source.height * 0.1,
                        ],
                      }),
                    },
                    {
                      scale: progress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.2],
                      }),
                    },
                  ],
                },
              ]}
            >
              {flight.text}
            </Animated.Text>
          ) : null}
        </View>
      </VisibilityContext.Provider>
    </Context.Provider>
  );
}

export function useTitleTransition() {
  const context = useContext(Context);
  return (
    context?.navigate ??
    ((
      _: RefObject<ViewInstance | null>,
      _id: string,
      _text: string,
      open: () => void,
    ) => open())
  );
}

export function TitleTransitionTarget({
  id,
  children,
  onLayout,
}: {
  id: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const context = useContext(Context);
  const transition = useContext(VisibilityContext);
  const routeKey = useContext(PaneContext)?.routeKey;
  const visible = usePaneVisible();
  const ref = useRef<ViewInstance>(null);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={
        transition?.id === id &&
        transition.sourceRouteKey !== transition.activeRouteKey &&
        (!routeKey || routeKey === transition.activeRouteKey) &&
        visible
          ? { opacity: 0 }
          : undefined
      }
      onLayout={(event) => {
        onLayout?.(event);
        if (visible && (!routeKey || routeKey === transition?.activeRouteKey))
          context?.target(id, ref.current);
      }}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { position: 'absolute', fontWeight: '700' },
});
