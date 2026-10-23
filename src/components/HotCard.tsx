import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/constants/designTokens';
import { usePaneRouter as useRouter } from '@/features/adaptive-layout/usePaneRouter';
import { useAuthStore } from '@/store/useAuthStore';
import { getCachedImageSource } from '@/utils/imageSource';
import { BouncyButton } from './BouncyButton';
import { Text, useRuntimeThemeColors } from './Themed';

export interface HotItem {
  id: string;
  questionId: string;
  title: string;
  excerpt: string;
  image: string | null;
  hotValue: string;
  rank: number;
  answerCount?: number;
  labelArea?: {
    type: string;
    trend?: number;
    text?: string;
    night_color?: string;
    normal_color?: string;
  } | null;
}

/** Where a row sits in the hot list; rows join into one rounded surface. */
export type HotCardPosition = 'first' | 'middle' | 'last' | 'only';

export function getHotCardPosition(
  index: number,
  count: number,
): HotCardPosition {
  if (count <= 1) return 'only';
  if (index === 0) return 'first';
  return index === count - 1 ? 'last' : 'middle';
}

const RANK_COLORS = [
  colors.light.hotRankFirst,
  colors.light.hotRankSecond,
  colors.light.hotRankThird,
];

const HotCardComponent = ({
  item,
  position = 'only',
}: {
  item: HotItem;
  position?: HotCardPosition;
}) => {
  const router = useRouter();
  const { cookies } = useAuthStore();
  const colorScheme = useColorScheme();
  const palette = useRuntimeThemeColors();
  const isGuest = !cookies;

  const rankColor = RANK_COLORS[item.rank - 1] ?? palette.textTertiary;
  const labelColor =
    colorScheme === 'dark'
      ? item.labelArea?.night_color || colors.light.hotLabel
      : item.labelArea?.normal_color || colors.light.hotLabel;
  const imageSource = useMemo(
    () => getCachedImageSource(item.image),
    [item.image],
  );
  const labelText =
    item.labelArea?.type === 'text' ? item.labelArea.text : undefined;
  const hasTrend = item.labelArea?.type === 'trend';
  const hasAnswerCount = (item.answerCount ?? 0) > 0;
  const metadata = [
    item.hotValue,
    hasAnswerCount ? `${item.answerCount} 个回答` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const isFirst = position === 'first' || position === 'only';
  const isLast = position === 'last' || position === 'only';

  return (
    <BouncyButton
      accessibilityRole="button"
      onPress={() => {
        if (isGuest) {
          router.push({
            pathname: '/guest/detail',
            params: {
              item: JSON.stringify({
                id: item.id,
                title: item.title,
                excerpt: item.excerpt,
                image: item.image,
                hotValue: item.hotValue,
                rank: item.rank,
                type: 'questions',
              }),
            },
          });
        } else {
          router.push(`/question/${item.questionId}`);
        }
      }}
      style={[
        styles.row,
        { backgroundColor: palette.backgroundSecondary },
        isFirst && styles.firstRow,
        isLast && styles.lastRow,
      ]}
    >
      {!isFirst ? (
        <View
          style={[styles.divider, { backgroundColor: palette.controlBorder }]}
        />
      ) : null}
      <Text style={[styles.rank, { color: rankColor }]} numberOfLines={1}>
        {item.rank}
      </Text>
      <View style={styles.textColumn}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {labelText || hasTrend || metadata ? (
          <View style={styles.metadata}>
            {labelText ? (
              <View
                style={[styles.label, { backgroundColor: `${labelColor}15` }]}
              >
                <Text style={[styles.labelText, { color: labelColor }]}>
                  {labelText}
                </Text>
              </View>
            ) : null}
            {hasTrend ? (
              <View
                accessibilityLabel="热度上升"
                accessible
                style={[styles.label, { backgroundColor: `${labelColor}15` }]}
              >
                <Ionicons name="trending-up" size={12} color={labelColor} />
              </View>
            ) : null}
            {metadata ? (
              <Text
                type="secondary"
                style={styles.metadataText}
                numberOfLines={1}
              >
                {metadata}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {imageSource ? (
        <Animated.Image
          source={imageSource}
          sharedTransitionTag={`image-${item.id}`}
          style={styles.image}
          resizeMode="cover"
          accessible={false}
        />
      ) : null}
    </BouncyButton>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  firstRow: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  lastRow: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    marginBottom: 12,
  },
  // 分割线从标题列开始，排名列下方不画线。
  divider: {
    position: 'absolute',
    top: 0,
    left: 52,
    right: 14,
    height: StyleSheet.hairlineWidth,
  },
  // 显式传给 Themed.Text，确保它按实际字号和行高应用阅读偏好。
  rank: {
    width: 28,
    textAlign: 'center',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  textColumn: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '700',
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  label: {
    flexShrink: 0,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  labelText: { fontSize: 11, fontWeight: '700' },
  metadataText: { flexShrink: 1, fontSize: 12 },
  image: {
    width: 104,
    aspectRatio: 3 / 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.05)',
  },
});

export const HotCard = React.memo(
  HotCardComponent,
  (previous, next) =>
    previous.item.id === next.item.id &&
    previous.item.questionId === next.item.questionId &&
    previous.item.title === next.item.title &&
    previous.item.excerpt === next.item.excerpt &&
    previous.item.image === next.item.image &&
    previous.item.hotValue === next.item.hotValue &&
    previous.item.rank === next.item.rank &&
    previous.item.answerCount === next.item.answerCount &&
    previous.item.labelArea?.type === next.item.labelArea?.type &&
    previous.item.labelArea?.text === next.item.labelArea?.text &&
    previous.item.labelArea?.trend === next.item.labelArea?.trend &&
    previous.item.labelArea?.normal_color ===
      next.item.labelArea?.normal_color &&
    previous.item.labelArea?.night_color === next.item.labelArea?.night_color &&
    previous.position === next.position,
);
HotCard.displayName = 'HotCard';
