import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPin } from '@/api/zhihu';
import { BouncyButton } from '@/components/BouncyButton';
import {
  Text,
  useRuntimeThemeColors,
  useThemeColor,
  View,
} from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import {
  PublishingDraftNotice,
  PublishingMediaPicker,
  serializePinText,
  usePublishingDraft,
} from '@/features/publishing';
import type { PublishingMediaItem } from '@/features/publishing/types';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import { getZhihuErrorMessage } from '@/utils/zhihuError';

export default function PublishPinScreen() {
  const { onPrimary } = useRuntimeThemeColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const queryClient = useQueryClient();
  const tintColor = useThemeColor({}, 'primary');
  const textColor = Colors[colorScheme].text;
  const secondaryColor = Colors[colorScheme].textSecondary;
  const borderCol = Colors[colorScheme].border;

  const [mediaBusy, setMediaBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const draft = usePublishingDraft(
    'pin',
    'new',
    undefined,
    true,
    mediaBusy,
    submitting,
  );
  const { update } = draft;
  const { title, content, images, media } = draft.value;
  const setTitle = useCallback(
    (value: string) => update({ title: value }),
    [update],
  );
  const setContent = useCallback(
    (value: string) => update({ content: value }),
    [update],
  );
  const setImages = useCallback(
    (value: typeof images) => update({ images: value }),
    [update],
  );
  const setMedia = useCallback(
    (value: PublishingMediaItem[]) => update({ media: value }),
    [update],
  );

  const submissionSessionRef = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: () => {
      if (submissionSessionRef.current !== getAuthSessionVersion())
        throw new Error('登录会话已变化，请重新进入编辑');
      return createPin(serializePinText(content), {
        title,
        images,
      });
    },
    onMutate: () => ({ sessionVersion: submissionSessionRef.current }),
    onSuccess: async (_result, _variables, context) => {
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      await draft.completePublished();
      if (context?.sessionVersion !== getAuthSessionVersion()) return;
      Alert.alert('发布成功', '您的想法已发布！');
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
      router.back();
    },
    onSettled: () => {
      submissionSessionRef.current = null;
      setSubmitting(false);
    },
    onError: (error: unknown, _variables, context) => {
      if (context?.sessionVersion === getAuthSessionVersion())
        Alert.alert('发布失败', getZhihuErrorMessage(error));
    },
  });

  const handlePublish = () => {
    if (submissionSessionRef.current !== null) return;
    if (!content.trim() && images.length === 0) {
      Alert.alert('提示', '请输入想法内容或添加图片');
      return;
    }
    if (mediaBusy) {
      Alert.alert('图片尚未准备好', '请等待上传完成，或重试、移除失败的图片。');
      return;
    }
    if (!draft.ready || draft.hasConflict || mutation.isPending) return;
    submissionSessionRef.current = getAuthSessionVersion();
    setSubmitting(true);
    mutation.mutate();
  };

  const isPublishEnabled =
    draft.ready &&
    (content.trim().length > 0 || images.length > 0) &&
    !mediaBusy &&
    !mutation.isPending;

  return (
    <View className="flex-1">
      <Stack.Screen options={{ headerShown: false, title: '发想法' }} />
      <View
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top + 10 }}
      >
        <BouncyButton
          onPress={() => router.back()}
          className="p-2 rounded-full"
        >
          <Ionicons name="close" size={28} color={textColor} />
        </BouncyButton>
        <Text className="text-lg font-bold">发想法</Text>
        <BouncyButton
          disabled={!isPublishEnabled}
          onPress={handlePublish}
          className="px-5 py-2 rounded-full min-w-[80px] items-center justify-center"
          style={{ backgroundColor: isPublishEnabled ? tintColor : borderCol }}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color={onPrimary} />
          ) : (
            <Text
              className="text-sm font-bold"
              style={{ color: isPublishEnabled ? onPrimary : secondaryColor }}
            >
              发布
            </Text>
          )}
        </BouncyButton>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1 px-5 pt-4"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            editable={draft.ready && !mutation.isPending}
            placeholder="标题（可选）"
            placeholderTextColor={secondaryColor}
            maxLength={100}
            style={{
              color: textColor,
              borderBottomColor: borderCol,
              borderBottomWidth: 1,
              fontSize: 19,
              fontWeight: '600',
              paddingBottom: 12,
              paddingHorizontal: 0,
            }}
          />
          <TextInput
            autoFocus
            value={content}
            onChangeText={setContent}
            editable={draft.ready && !mutation.isPending}
            multiline
            placeholder="这一刻的想法..."
            placeholderTextColor={secondaryColor}
            textAlignVertical="top"
            style={{
              color: textColor,
              fontSize: 17,
              lineHeight: 27,
              minHeight: 230,
              paddingHorizontal: 0,
              paddingTop: 16,
            }}
          />
          <PublishingDraftNotice draft={draft} />
          {draft.ready && (
            <PublishingMediaPicker
              key={draft.scopeKey}
              draftScope={draft.scope}
              initialMedia={media}
              onMediaChange={setMedia}
              disabled={mutation.isPending || draft.hasConflict}
              onBusyChange={setMediaBusy}
              onImagesChange={setImages}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
