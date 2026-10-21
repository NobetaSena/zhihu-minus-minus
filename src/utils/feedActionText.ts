import { formatRelativeTime } from '@/utils/date';

/**
 * 关注流动态行：知乎返回的 action_text 把人名和动作连在一起（「张三赞同了回答」），
 * 在人名后补一个空格，再用「 · 」接上时间。
 */
export function formatFeedActionText(
  actionText: string | undefined,
  actorName: string | undefined,
  time: number | undefined,
  now = Date.now(),
): string | undefined {
  if (!actionText) return undefined;
  const text =
    actorName &&
    actionText.startsWith(actorName) &&
    actionText.length > actorName.length &&
    !/^\s/.test(actionText.slice(actorName.length))
      ? `${actorName} ${actionText.slice(actorName.length)}`
      : actionText;
  return time ? `${text} · ${formatRelativeTime(time, now)}` : text;
}
