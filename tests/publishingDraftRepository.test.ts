import * as FileSystem from 'expo-file-system/legacy';
import { emptyPublishingDraft } from '../src/features/publishing/types';
import { publishingDraftRepository } from '../src/storage/publishingDraftRepository';

const mockRows = new Map<string, string>();
const mockDatabase = {
  getFirstAsync: jest.fn(async (_sql: string, params: string[]) => {
    const value = mockRows.get(params.join('|'));
    return value ? { value_json: value } : null;
  }),
  runAsync: jest.fn(async (sql: string, params: Array<string | number>) => {
    if (sql.startsWith('INSERT'))
      mockRows.set(`${params[0]}|${params[1]}`, String(params[2]));
    else if (params.length === 1)
      for (const key of mockRows.keys()) {
        if (key.startsWith(`${params[0]}|`)) mockRows.delete(key);
      }
    else mockRows.delete(`${params[0]}|${params[1]}`);
  }),
};
jest.mock('../src/storage/localDatabase', () => ({
  localDatabase: {
    run: (operation: (database: typeof mockDatabase) => Promise<unknown>) =>
      operation(mockDatabase),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///synthetic/',
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));
const a = { accountKey: 'id:A', kind: 'article' as const, target: 'new' };
const b = { ...a, accountKey: 'id:B' };

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.clear();
});

test('round-trips account-scoped drafts and restores interrupted uploads as failed', async () => {
  const asset = await publishingDraftRepository.retainAsset(a, 'media-1', {
    uri: 'file:///temporary.jpg',
    width: 10,
    height: 20,
  });
  const value = {
    ...emptyPublishingDraft(),
    content: '合成草稿',
    media: [{ id: 'media-1', asset, status: 'uploading' as const }],
  };
  await publishingDraftRepository.save(a, value);
  expect(await publishingDraftRepository.read(b)).toBeNull();
  expect(await publishingDraftRepository.read(a)).toEqual({
    ...value,
    media: [expect.objectContaining({ status: 'failed', asset })],
  });
  await publishingDraftRepository.clearAccount('id:A');
  expect(await publishingDraftRepository.read(a)).toBeNull();
  expect(FileSystem.deleteAsync).toHaveBeenCalled();
});

test('guest and unbound drafts cannot be persisted, and cleanup never removes foreign paths', async () => {
  await expect(
    publishingDraftRepository.save(
      { ...a, accountKey: 'guest' },
      emptyPublishingDraft(),
    ),
  ).rejects.toThrow();
  await publishingDraftRepository.releaseAsset(
    a,
    'file:///synthetic/auth-storage.json',
  );
  expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
});

test('account removal during asset retention removes the late file', async () => {
  let finishCopy: () => void = () => {};
  jest.mocked(FileSystem.copyAsync).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCopy = resolve;
      }),
  );
  const retaining = publishingDraftRepository.retainAsset(a, 'media-2', {
    uri: 'file:///temporary.jpg',
    width: 10,
    height: 20,
  });
  await Promise.resolve();
  await publishingDraftRepository.clearAccount('id:A');
  finishCopy();
  await expect(retaining).rejects.toThrow('账号已移除');
  expect(FileSystem.deleteAsync).toHaveBeenLastCalledWith(
    expect.stringContaining('media-2.image'),
    { idempotent: true },
  );
});

test('a stale editor token cannot recreate the draft after account removal', async () => {
  const oldScope = {
    ...a,
    generation: publishingDraftRepository.getGeneration(a.accountKey),
  };
  await publishingDraftRepository.clearAccount(a.accountKey);
  await publishingDraftRepository.save(oldScope, {
    ...emptyPublishingDraft(),
    content: '旧页面晚保存',
  });
  expect(await publishingDraftRepository.read(a)).toBeNull();
});

test.each([
  '{broken',
  '{"version":7,"value":{}}',
  '{"version":1,"value":{}}',
])('an unreadable stored row stays intact and fails closed: %s', async (stored) => {
  const key = `${a.accountKey}|article:new`;
  mockRows.set(key, stored);
  await expect(publishingDraftRepository.read(a)).rejects.toThrow(
    '草稿内容暂时无法读取',
  );
  expect(mockRows.get(key)).toBe(stored);
  expect(mockDatabase.runAsync).not.toHaveBeenCalled();
});
