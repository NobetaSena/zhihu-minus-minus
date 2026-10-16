import axios, { CanceledError } from 'axios';
import apiClient from '../api/client';
import { touchAnswerRead } from '../api/zhihu/lastRead';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { post: jest.fn() },
  hasAuthenticationCookie: (cookie: string | null | undefined) =>
    typeof cookie === 'string' && /(?:^|;\s*)z_c0=[^;\s]+/.test(cookie),
}));

let mockSessionVersion = 3;
let mockCookies = 'z_c0=synthetic-session';
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: { getState: () => ({ cookies: mockCookies }) },
}));

const post = jest.mocked(apiClient.post);
const ANSWER_ID = '2093868403115155780';

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ data: {} });
  mockSessionVersion = 3;
  mockCookies = 'z_c0=synthetic-session';
});

test('posts the exact Web multipart touch field without losing large answer IDs', async () => {
  const controller = new AbortController();
  await touchAnswerRead(ANSWER_ID, { signal: controller.signal });

  expect(post).toHaveBeenCalledTimes(1);
  const [url, body, config] = post.mock.calls[0];
  expect(axios.getUri({ ...config, url })).toBe(
    'https://www.zhihu.com/lastread/touch',
  );
  expect(config).toEqual({
    baseURL: 'https://www.zhihu.com',
    headers: {
      'Content-Type': 'multipart/form-data',
      'x-requested-with': 'fetch',
      Referer: 'https://www.zhihu.com/',
    },
    signal: controller.signal,
    zhihuSessionVersion: 3,
    zhihuSkipVerification: true,
  });
  expect(body).toBeInstanceOf(FormData);
  expect((body as FormData).getAll('items')).toEqual([
    JSON.stringify([['answer', ANSWER_ID, 'touch']]),
  ]);
  expect((body as FormData).getAll('targets')).toEqual([]);
});

test('passes the originating session to the client for asynchronous session checks', async () => {
  await touchAnswerRead('42', { sessionVersion: 3 });
  expect(post.mock.calls[0][2]).toEqual(
    expect.objectContaining({ zhihuSessionVersion: 3 }),
  );
});

test('rejects an outgoing account event before creating a request for the current account', async () => {
  await expect(
    touchAnswerRead('42', { sessionVersion: 2 }),
  ).rejects.toBeInstanceOf(CanceledError);
  expect(post).not.toHaveBeenCalled();
});

test.each([
  '',
  'd_c0=synthetic-tracking',
  'z_c0=; d_c0=synthetic-tracking',
])('skips unauthenticated requests (%#)', async (cookies) => {
  mockCookies = cookies;
  await touchAnswerRead('42');
  expect(post).not.toHaveBeenCalled();
});

test.each([
  '',
  ' \n\t ',
])('does not report an empty answer ID (%#)', async (id) => {
  await touchAnswerRead(id);
  expect(post).not.toHaveBeenCalled();
});

test('propagates a failed request so the reading hook can handle it without blocking content', async () => {
  const failure = new Error('Synthetic request failure');
  post.mockRejectedValueOnce(failure);
  await expect(touchAnswerRead('42')).rejects.toBe(failure);
});
