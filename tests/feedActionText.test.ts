import { formatFeedActionText } from '../utils/feedActionText';

const now = new Date(2026, 9, 21, 12, 0, 0).getTime();
const eightMinutesAgo = now / 1000 - 8 * 60;

test('separates the actor name, the action and the time', () => {
  expect(
    formatFeedActionText(
      '恶魔梨梨酱OvO赞同了回答',
      '恶魔梨梨酱OvO',
      eightMinutesAgo,
      now,
    ),
  ).toBe('恶魔梨梨酱OvO 赞同了回答 · 8分钟前');
});

test('keeps text that does not start with the actor name', () => {
  expect(
    formatFeedActionText('关注的问题有了新回答', '张三', undefined, now),
  ).toBe('关注的问题有了新回答');
});

test('returns nothing without an action', () => {
  expect(
    formatFeedActionText(undefined, '张三', eightMinutesAgo, now),
  ).toBeUndefined();
});
