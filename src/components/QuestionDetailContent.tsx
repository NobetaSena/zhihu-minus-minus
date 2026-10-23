import {
  RICH_CONTENT_BODY_FONT_SIZE,
  ZhihuContent,
} from '@/features/rich-content';

/**
 * 问题描述的字号与行高。收起时的摘要和展开后的富文本共用这一组数值，
 * 展开、收起之间字号不跳变。
 */
export const QUESTION_DETAIL_TEXT_STYLE = { fontSize: 14, lineHeight: 22 };

/** 展开后的问题描述：按收起时的字号行高缩放富文本正文。 */
export function QuestionDetailContent({
  content,
  questionId,
}: {
  content: string;
  questionId: string;
}) {
  return (
    <ZhihuContent
      content={content}
      objectId={questionId}
      type="question"
      fontSizeScale={
        QUESTION_DETAIL_TEXT_STYLE.fontSize / RICH_CONTENT_BODY_FONT_SIZE
      }
      lineHeightScale={
        QUESTION_DETAIL_TEXT_STYLE.lineHeight /
        QUESTION_DETAIL_TEXT_STYLE.fontSize
      }
    />
  );
}
