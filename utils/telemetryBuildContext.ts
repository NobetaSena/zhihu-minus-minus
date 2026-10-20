import Constants from 'expo-constants';
import { osVersion } from 'expo-device';
import type { TelemetryBuildContext } from './telemetrySanitizer';

const SOURCE_ROOTS = new Set([
  'app',
  'components',
  'hooks',
  'utils',
  'api',
  'features',
  'storage',
  'store',
  'modules',
  'types',
  'constants',
]);
const EXCLUDED_DIRECTORIES = new Set([
  'fixtures',
  'tests',
  '__tests__',
  '__mocks__',
  'assets',
  'node_modules',
  'build',
  'dist',
  'vendor',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function version(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length < 40 &&
    /^\d+(?:[._-]\d+){0,4}$/.test(value)
    ? value
    : undefined;
}

function hex(value: unknown, length: number): string | undefined {
  return typeof value === 'string' &&
    new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(value)
    ? value.toLowerCase()
    : undefined;
}

function sourceFile(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 240 ||
    !/\.(?:[cm]?jsx?|tsx?|swift|m|mm|h|java|kt)$/.test(value) ||
    /\.(?:test|spec)\.[^/]+$/.test(value)
  )
    return false;
  const segments = value.split('/');
  return (
    segments.length >= 2 &&
    SOURCE_ROOTS.has(segments[0]) &&
    segments.every(
      (segment) =>
        !segment.startsWith('.') &&
        /^[\w()[\]+.-]+$/.test(segment) &&
        !EXCLUDED_DIRECTORIES.has(segment) &&
        !/(?:^|[._-])(?:config|env|secrets?|credentials?)(?:[._-]|$)/i.test(
          segment,
        ),
    )
  );
}

/** Shared metadata for local diagnostics and telemetry, with no device/user identifiers. */
export function getTelemetryBuildContext(): TelemetryBuildContext {
  const candidate: unknown = Constants.expoConfig?.extra?.diagnostics;
  const diagnostics = isRecord(candidate) ? candidate : {};
  const sourceFiles = Array.isArray(diagnostics.sourceFiles)
    ? [...new Set(diagnostics.sourceFiles.filter(sourceFile))]
    : undefined;
  return {
    appVersion: version(Constants.expoConfig?.version),
    buildNumber:
      version(Constants.nativeBuildVersion) ??
      version(Constants.platform?.ios?.buildNumber),
    osVersion: version(osVersion),
    commit: hex(diagnostics.commit, 40),
    sourceFingerprint: hex(diagnostics.sourceFingerprint, 24),
    sourceFiles,
    platform: Constants.platform?.ios
      ? 'ios'
      : Constants.platform?.android
        ? 'android'
        : 'other',
    environment: __DEV__ ? 'development' : 'production',
  };
}
