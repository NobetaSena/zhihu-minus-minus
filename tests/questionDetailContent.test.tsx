import { render } from '@testing-library/react-native';
import {
  QUESTION_DETAIL_TEXT_STYLE,
  QuestionDetailContent,
} from '../src/components/QuestionDetailContent';
import type { ZhihuContentProps } from '../src/features/rich-content';
import { createRichContentMetrics } from '../src/features/rich-content/presentation';

const mockRichContent = jest.fn((_props: ZhihuContentProps) => null);

jest.mock('../src/features/rich-content', () => ({
  RICH_CONTENT_BODY_FONT_SIZE: jest.requireActual(
    '../src/features/rich-content/presentation',
  ).RICH_CONTENT_BODY_FONT_SIZE,
  ZhihuContent: (props: ZhihuContentProps) => mockRichContent(props),
}));

test('the expanded description renders its body text at the collapsed size', async () => {
  await render(
    <QuestionDetailContent content="<p>合成问题描述</p>" questionId="q1" />,
  );
  const props = mockRichContent.mock.calls.at(-1)?.[0];
  expect(props).toMatchObject({
    content: '<p>合成问题描述</p>',
    objectId: 'q1',
    type: 'question',
  });
  const { body } = createRichContentMetrics(
    props?.fontSizeScale ?? Number.NaN,
    props?.lineHeightScale ?? Number.NaN,
  );
  expect(body.fontSize).toBeCloseTo(QUESTION_DETAIL_TEXT_STYLE.fontSize);
  expect(body.lineHeight).toBeCloseTo(QUESTION_DETAIL_TEXT_STYLE.lineHeight);
});
