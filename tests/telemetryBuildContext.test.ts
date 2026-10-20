import Constants from 'expo-constants';
import { getTelemetryBuildContext } from '../utils/telemetryBuildContext';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { version: '0.9.2', extra: {} },
    nativeBuildVersion: '42',
    platform: { ios: {} },
  },
}));
jest.mock('expo-device', () => ({ osVersion: '27.0.1' }));

beforeEach(() => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {};
});

test('returns shared version, build, system and source identifiers', () => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {
    diagnostics: {
      commit: 'A'.repeat(40),
      sourceFingerprint: 'B'.repeat(24),
      sourceFiles: ['components/RecentMoments.tsx', 'app/(tabs)/index.tsx'],
    },
  };
  expect(getTelemetryBuildContext()).toEqual({
    appVersion: '0.9.2',
    buildNumber: '42',
    osVersion: '27.0.1',
    platform: 'ios',
    environment: 'development',
    commit: 'a'.repeat(40),
    sourceFingerprint: 'b'.repeat(24),
    sourceFiles: ['components/RecentMoments.tsx', 'app/(tabs)/index.tsx'],
  });
});

test('uses the native iOS build number exposed by Expo Constants in a dev client', () => {
  const originalBuild = Constants.nativeBuildVersion;
  const originalPlatform = Constants.platform;
  if (!originalPlatform?.ios)
    throw new Error('Missing synthetic iOS constants');
  try {
    Constants.nativeBuildVersion = null;
    Constants.platform = {
      ios: { ...originalPlatform.ios, buildNumber: '17' },
    };
    expect(getTelemetryBuildContext().buildNumber).toBe('17');
    Constants.platform = {
      ios: { ...originalPlatform.ios, buildNumber: 'synthetic-private' },
    };
    expect(getTelemetryBuildContext().buildNumber).toBeUndefined();
  } finally {
    Constants.nativeBuildVersion = originalBuild;
    Constants.platform = originalPlatform;
  }
});

test('rejects unsafe manifest values and limits filenames to relative source paths', () => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = {
    diagnostics: {
      commit: 'synthetic-private-data',
      sourceFingerprint: 'https://example.invalid/private',
      sourceFiles: [
        'components/RecentMoments.tsx',
        'components/RecentMoments.tsx',
        '/private/user/app.tsx',
        'components/../private.ts',
        'components/RecentMoments.tsx?cookie=private',
        'app\\private.ts',
        'features/rich-content/fixtures/private.ts',
        'utils/env.ts',
        'utils/secrets.ts',
        'utils/config/private.ts',
        'components/__tests__/private.tsx',
        'components/RecentMoments.test.tsx',
        42,
        null,
      ],
    },
  };
  expect(getTelemetryBuildContext()).toMatchObject({
    commit: undefined,
    sourceFingerprint: undefined,
    sourceFiles: ['components/RecentMoments.tsx'],
  });
});

test.each([
  undefined,
  null,
  [],
  'invalid',
  { sourceFiles: 'invalid' },
])('supports builds without a valid source manifest: %s', (diagnostics) => {
  if (!Constants.expoConfig) throw new Error('Missing test config');
  Constants.expoConfig.extra = { diagnostics };
  expect(getTelemetryBuildContext()).toMatchObject({
    appVersion: '0.9.2',
    buildNumber: '42',
    sourceFiles: undefined,
  });
});
