import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDiagnosticsManifest } from '../app.config';

jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));

let root: string;
const commit = '0123456789abcdef0123456789abcdef01234567';

function write(relative: string, contents = 'export const value = 1;'): void {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'zhihu-diagnostics-manifest-'));
  jest.mocked(execFileSync).mockReturnValue(`${commit}\n`);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test('fingerprint distinguishes uncommitted source contents and remains deterministic', () => {
  write('components/RecentMoments.tsx');
  write('app/user/[id]/stream.tsx');
  const initial = createDiagnosticsManifest(root);
  expect(initial).toEqual({
    commit,
    sourceFingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
    sourceFiles: ['app/user/[id]/stream.tsx', 'components/RecentMoments.tsx'],
  });
  expect(createDiagnosticsManifest(root)).toEqual(initial);
  write('components/RecentMoments.tsx', 'export const value = 2;');
  const edited = createDiagnosticsManifest(root);
  expect(edited.commit).toBe(initial.commit);
  expect(edited.sourceFingerprint).not.toBe(initial.sourceFingerprint);
  expect(JSON.stringify(edited)).not.toContain(root);
  expect(JSON.stringify(edited)).not.toContain('export const');
});

test('ignores test fixtures, assets, config, credentials and files outside source roots', () => {
  write('components/RecentMoments.tsx');
  const initial = createDiagnosticsManifest(root);
  for (const path of [
    '.env',
    'app.config.ts',
    'tests/example.test.tsx',
    'features/rich-content/fixtures/private.ts',
    'components/__tests__/private.tsx',
    'components/RecentMoments.test.tsx',
    'components/RecentMoments.spec.tsx',
    'components/assets/private.ts',
    'modules/native/build/private.kt',
    'utils/secrets.ts',
    'utils/local.config.ts',
    'utils/credentials/local.ts',
    'utils/.local.ts',
  ]) {
    write(path, 'synthetic-private-data');
  }
  expect(createDiagnosticsManifest(root)).toEqual(initial);
});

test('does not follow source-file or directory symlinks', () => {
  write('components/RecentMoments.tsx');
  write('private/outside.ts', 'synthetic-private-data');
  const initial = createDiagnosticsManifest(root);
  symlinkSync(
    join(root, 'private/outside.ts'),
    join(root, 'components/linked.ts'),
  );
  symlinkSync(join(root, 'private'), join(root, 'components/linked'));
  expect(createDiagnosticsManifest(root)).toEqual(initial);
});

test('source archives still get a fingerprint without Git metadata', () => {
  write('utils/example.ts');
  jest.mocked(execFileSync).mockImplementation(() => {
    throw new Error('Missing git');
  });
  expect(createDiagnosticsManifest(root)).toEqual({
    sourceFingerprint: expect.stringMatching(/^[a-f0-9]{24}$/),
    sourceFiles: ['utils/example.ts'],
  });
});

test('unavailable source directory degrades without breaking configuration', () => {
  expect(createDiagnosticsManifest(join(root, 'missing'))).toEqual({ commit });
});
