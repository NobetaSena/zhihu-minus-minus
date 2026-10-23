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

/** 前三名用丝带角标，颜色由深到浅；之后的排名是橙色数字。 */
const RIBBON_COLORS = [
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

  const ribbonColor = RIBBON_COLORS[item.rank - 1];
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
      <View style={styles.rankColumn}>
        {ribbonColor ? (
          <View style={styles.ribbon}>
            <Ionicons name="bookmark" size={22} color={ribbonColor} />
            <Text style={styles.ribbonText} numberOfLines={1}>
              {item.rank}
            </Text>
          </View>
        ) : (
          <Text
            style={[styles.rank, { color: colors.light.hotLabel }]}
            numberOfLines={1}
          >
            {item.rank}
          </Text>
        )}
        {labelText ? (
          <View style={[styles.label, { borderColor: labelColor }]}>
            <Text style={[styles.labelText, { color: labelColor }]}>
              {labelText}
            </Text>
          </View>
        ) : null}
        {hasTrend ? (
          <View accessibilityLabel="热度上升" accessible style={styles.trend}>
            <Ionicons name="trending-up" size={13} color={labelColor} />
          </View>
        ) : null}
      </View>
      <View style={styles.textColumn}>
        <Text style={styles.title}>{item.title}</Text>
        {item.hotValue ? (
          <Text type="secondary" style={styles.hotValue} numberOfLines={1}>
            {item.hotValue}
          </Text>
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
  divider: {
    position: 'absolute',
    top: 0,
    left: 14,
    right: 14,
    height: StyleSheet.hairlineWidth,
  },
  rankColumn: {
    width: 24,
    alignItems: 'center',
    gap: 4,
  },
  ribbon: {
    width: 24,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonText: {
    position: 'absolute',
    top: 1,
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  // 显式传给 Themed.Text，确保它按实际字号和行高应用阅读偏好。
  rank: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  label: {
    paddingHorizontal: 2,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  labelText: { fontSize: 10, lineHeight: 14, fontWeight: '700' },
  trend: { alignItems: 'center' },
  textColumn: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  hotValue: { marginTop: 6, fontSize: 13 },
  image: {
    width: 60,
    height: 60,
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
