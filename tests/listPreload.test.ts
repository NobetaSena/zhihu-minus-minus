import { renderHook } from '@testing-library/react-native';
import {
  PRELOAD_DRAW_DISTANCE,
  PRELOAD_END_THRESHOLD,
  useListPreload,
} from '../hooks/useListPreload';
import { useSettingsStore } from '../store/useSettingsStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

test('keeps each list threshold when preloading is off', async () => {
  useSettingsStore.setState({ enableListPreload: false });
  const { result } = await renderHook(() => useListPreload(0.3));
  expect(result.current).toEqual({ onEndReachedThreshold: 0.3 });
});

test('requests pages screens ahead and renders more rows when preloading is on', async () => {
  useSettingsStore.setState({ enableListPreload: true });
  const { result } = await renderHook(() => useListPreload(0.5));
  expect(result.current).toEqual({
    onEndReachedThreshold: PRELOAD_END_THRESHOLD,
    drawDistance: PRELOAD_DRAW_DISTANCE,
  });
});
