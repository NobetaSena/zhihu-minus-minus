import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { usePaneVisible } from './PaneContext';

type Frame = { x: number; y: number; width: number; height: number };
type PendingTitle = {
  id: string;
  text: string;
  source: Frame;
  expires: number;
  isValid?: () => boolean;
  destinationKey?: string;
};
type Flight = { text: string; source: Frame; target: Frame };
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
  const sequence = useRef(0);
  const progress = useRef(new Animated.Value(0)).current;
  const reducedMotion = useRef(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  const flightRef = useRef(flight);
  flightRef.current = flight;
  const previousRoute = useRef(activeRouteKey);
  const colors = useRuntimeThemeColors();
  const fontSizeScale = useSettingsStore((state) => state.fontSizeScale);
  const lineHeightScale = useSettingsStore((state) => state.lineHeightScale);

  useLayoutEffect(() => {
    if (previousRoute.current === activeRouteKey) return;
    previousRoute.current = activeRouteKey;
    if (flightRef.current || pending.current?.destinationKey) {
      sequence.current += 1;
      pending.current = null;
      progress.stopAnimation();
      setFlight(null);
    } else if (pending.current) {
      pending.current.destinationKey = activeRouteKey;
    }
  }, [activeRouteKey, progress]);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reducedMotion.current = enabled;
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        reducedMotion.current = enabled;
      },
    );
    return () => {
      mounted = false;
      sequence.current += 1;
      subscription.remove();
    };
  }, []);

  const navigate = useCallback<TitleTransition['navigate']>(
    (ref, id, text, open, isValid) => {
      const token = ++sequence.current;
      pending.current = null;
      setFlight(null);
      if (!id || !text || reducedMotion.current || !ref.current) {
        open();
        return;
      }
      let completed = false;
      const finish = (source?: Frame) => {
        if (completed || token !== sequence.current) return;
        completed = true;
        clearTimeout(timeout);
        if (source && validFrame(source) && (!isValid || isValid())) {
          pending.current = {
            id,
            text,
            source,
            expires: Date.now() + 1500,
            isValid,
          };
        }
        open();
      };
      const timeout = setTimeout(() => finish(), 100);
      ref.current.measureInWindow((x, y, width, height) => {
        finish({ x, y, width, height });
      });
    },
    [],
  );

  const target = useCallback<TitleTransition['target']>(
    (id, ref) => {
      const current = pending.current;
      if (!current || current.id !== id || !ref || !root.current) return;
      if (
        Date.now() > current.expires ||
        reducedMotion.current ||
        (current.isValid && !current.isValid())
      ) {
        pending.current = null;
        return;
      }
      const token = sequence.current;
      ref.measureInWindow((x, y, width, height) => {
        const destination = { x, y, width, height };
        if (!validFrame(destination) || token !== sequence.current) return;
        root.current?.measureInWindow((rootX, rootY) => {
          if (
            token !== sequence.current ||
            pending.current !== current ||
            (current.isValid && !current.isValid())
          )
            return;
          pending.current = null;
          setFlight({
            text: current.text,
            source: {
              ...current.source,
              x: current.source.x - rootX,
              y: current.source.y - rootY,
            },
            target: {
              ...destination,
              x: destination.x - rootX,
              y: destination.y - rootY,
            },
          });
          progress.setValue(0);
          Animated.timing(progress, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished && token === sequence.current) setFlight(null);
          });
        });
      });
    },
    [progress],
  );

  return (
    <Context.Provider value={{ navigate, target }}>
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
  const visible = usePaneVisible();
  const ref = useRef<ViewInstance>(null);
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={(event) => {
        onLayout?.(event);
        if (visible) context?.target(id, ref.current);
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
