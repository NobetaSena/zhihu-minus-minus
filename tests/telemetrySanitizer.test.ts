import type { Event } from '@sentry/react-native';
import {
  sanitizeSentryEvent,
  type TelemetryBuildContext,
} from '../utils/telemetrySanitizer';

const build: TelemetryBuildContext = {
  appVersion: '0.9.2',
  buildNumber: '37',
  commit: 'a'.repeat(40),
  sourceFingerprint: 'b'.repeat(24),
  sourceFiles: ['components/RecentMoments.tsx'],
  osVersion: '27.0',
  platform: 'ios',
  environment: 'development',
};

test('retains an actionable cause, build, location and fixed context without runtime values', () => {
  const secret = 'synthetic-private-token';
  const event: Event = {
    exception: {
      values: [
        {
          type: 'TypeError',
          value: "Cannot read properties of undefined (reading 'length')",
          stacktrace: {
            frames: [
              {
                filename: `/Users/${secret}/project/components/RecentMoments.tsx?Cookie=${secret}`,
                function: secret,
                vars: { Cookie: secret },
                context_line: secret,
                lineno: 43,
                colno: 9,
                debug_id: '12345678-1234-1234-1234-123456789abc',
              },
            ],
          },
        },
      ],
    },
    contexts: {
      diagnostic: {
        area: 'following.recent-moments',
        operation: 'render',
        route: secret,
      },
    },
    tags: { Cookie: secret, error_code: secret },
    extra: { response: secret },
  };
  const safe = sanitizeSentryEvent(event, build);
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe?.exception?.values?.[0]).toEqual({
    type: 'TypeError',
    value: "Cannot read property 'length' of undefined",
    stacktrace: {
      frames: [
        {
          filename: 'components/RecentMoments.tsx',
          lineno: 43,
          colno: 9,
          debug_id: '12345678-1234-1234-1234-123456789abc',
        },
      ],
    },
  });
  expect(safe?.tags).toEqual({
    app_version: '0.9.2',
    build_number: '37',
    commit: 'a'.repeat(40),
    source_fingerprint: 'b'.repeat(24),
    platform: 'ios',
    error_code: 'js.undefined-property',
  });
  expect(safe?.contexts?.diagnostic).toEqual({
    area: 'following.recent-moments',
    operation: 'render',
  });
  expect(safe?.contexts?.app).toEqual({
    app_version: '0.9.2',
    app_build: '37',
  });
  expect(safe).not.toBeNull();
  if (safe) expect(sanitizeSentryEvent(safe, build)).toEqual(safe);
});

test('rejects unexpected build identifiers and contextual runtime strings', () => {
  const secret = 'synthetic-private-token';
  const safe = sanitizeSentryEvent<Event>(
    {
      exception: {
        values: [
          {
            type: 'TypeError',
            value: `Cannot read property '${secret}' of null`,
          },
        ],
      },
      contexts: { diagnostic: { area: secret, operation: secret } },
    },
    {
      ...build,
      buildNumber: secret,
      commit: secret,
      sourceFingerprint: secret,
    },
  );
  expect(JSON.stringify(safe)).not.toContain(secret);
  expect(safe?.tags).toEqual({
    app_version: '0.9.2',
    platform: 'ios',
    error_code: 'js.null-property',
  });
  expect(safe?.exception?.values?.[0].value).toBe(
    "Cannot read property '<redacted>' of null",
  );
  expect(safe?.contexts?.diagnostic).toBeUndefined();
});
