import { render } from '@testing-library/react-native';
import {
  getHotCardPosition,
  HotCard,
  type HotItem,
} from '../src/components/HotCard';
import { colors } from '../src/constants/designTokens';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { Image: jest.requireActual('react-native').Image },
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: () => ({ cookies: 'synthetic-session' }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  useRuntimeThemeColors: () => ({
    backgroundSecondary: '#ffffff',
    controlBorder: '#e5e5ea',
    textTertiary: '#999999',
  }),
}));

const item = (rank: number): HotItem => ({
  id: `hot-${rank}`,
  questionId: `question-${rank}`,
  title: `合成热榜问题 ${rank}`,
  excerpt: '',
  image: null,
  hotValue: '893 万热度',
  rank,
  answerCount: 188,
});

test.each([
  [0, 1, 'only'],
  [0, 3, 'first'],
  [1, 3, 'middle'],
  [2, 3, 'last'],
])('row %i of %i joins the list as %s', (index, count, position) => {
  expect(getHotCardPosition(index, count)).toBe(position);
});

test('a row shows the whole title with only its heat underneath', async () => {
  const host = await render(<HotCard item={item(1)} position="first" />);
  expect(host.getByText('合成热榜问题 1').props.numberOfLines).toBeUndefined();
  expect(host.getByText('893 万热度')).toBeTruthy();
  expect(host.queryByText(/个回答/)).toBeNull();
});

test.each([1, 2, 3])('rank %i sits on a ribbon in white', async (rank) => {
  const host = await render(<HotCard item={item(rank)} position="middle" />);
  expect(host.getByText(String(rank))).toHaveStyle({ color: '#ffffff' });
});

test('ranks after the top three are orange numbers', async () => {
  const host = await render(<HotCard item={item(4)} position="middle" />);
  expect(host.getByText('4')).toHaveStyle({ color: colors.light.hotLabel });
});
