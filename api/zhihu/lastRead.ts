import { type AxiosRequestConfig, CanceledError } from 'axios';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import apiClient, {
  type ApiRequestOptions,
  hasAuthenticationCookie,
} from '../client';

/** Report an answer that is being read through Zhihu's Web touch endpoint. */
export async function touchAnswerRead(
  answerId: string,
  options: ApiRequestOptions & { sessionVersion?: number } = {},
): Promise<void> {
  const id = answerId.trim();
  if (!id) return;

  const sessionVersion = options.sessionVersion ?? getAuthSessionVersion();
  if (sessionVersion !== getAuthSessionVersion()) {
    throw new CanceledError('登录会话已切换');
  }
  if (!hasAuthenticationCookie(useAuthStore.getState().cookies)) return;

  const form = new FormData();
  form.append('items', JSON.stringify([['answer', id, 'touch']]));
  const config: AxiosRequestConfig & {
    zhihuSessionVersion: number;
    zhihuSkipVerification: boolean;
  } = {
    baseURL: 'https://www.zhihu.com',
    // React Native supplies the multipart boundary when serializing FormData.
    headers: {
      'Content-Type': 'multipart/form-data',
      'x-requested-with': 'fetch',
      Referer: 'https://www.zhihu.com/',
    },
    signal: options.signal,
    zhihuSessionVersion: sessionVersion,
    // Optional feedback must not open a verification modal over the answer.
    zhihuSkipVerification: true,
  };
  await apiClient.post<unknown>('/lastread/touch', form, config);
}
