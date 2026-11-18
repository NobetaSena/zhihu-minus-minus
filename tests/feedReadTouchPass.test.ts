import {
  type FeedReadTouchBatch,
  getPassedReadTouchBatches,
  indexFeedPageCards,
} from '../src/utils/feedReadTouch';

const batch = (batchId: number): FeedReadTouchBatch => ({
  batchId,
  sessionVersion: 1,
  answerIds: [`answer-${batchId}`],
});
const card = (id: string) => ({ id });

const a1 = card('a1');
const a2 = card('a2');
const b1 = card('b1');
const c1 = card('c1');
const pages = [
  { items: [a1, a2], readTouchBatch: batch(0) },
  // Every card of this page was filtered out or de-duplicated.
  { items: [b1], readTouchBatch: batch(1) },
  { items: [c1], readTouchBatch: batch(2) },
];
const pageOf = indexFeedPageCards(pages);

test('cards of the first page on screen pass no page', () => {
  expect(getPassedReadTouchBatches(pages, pageOf, [a1, a2])).toEqual([]);
});

test('a card on screen passes every earlier page, even one with no cards shown', () => {
  expect(
    getPassedReadTouchBatches(pages, pageOf, [a2, c1]).map((b) => b?.batchId),
  ).toEqual([0, 1]);
});

test('the furthest card decides, whatever the order on screen', () => {
  expect(
    getPassedReadTouchBatches(pages, pageOf, [b1, a1]).map((b) => b?.batchId),
  ).toEqual([0]);
});

test('cards from no loaded page, such as a replaced response, pass nothing', () => {
  expect(getPassedReadTouchBatches(pages, pageOf, [card('a1')])).toEqual([]);
});
