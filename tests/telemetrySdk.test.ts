import * as Sentry from '@sentry/react-native';
import { rememberDiagnosticContext } from '../src/utils/diagnosticContext';
import { recordDiagnosticEvent } from '../src/utils/diagnosticLogs';
import { sanitizeSentryEvent } from '../src/utils/telemetrySanitizer';

jest.mock('@sentry/react-native', () => {
  const sdk = jest.requireActual('@sentry/react-native');
  return { ...sdk, init: jest.fn(sdk.init) };
});
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '0.9.2',
      extra: { sentryDsn: 'https://synthetic@example.invalid/1' },
    },
    platform: { ios: {} },
  },
}));
jest.mock('expo-device', () => ({ osVersion: '18.0' }));
jest.mock('../src/utils/diagnosticLogs', () => ({
  recordDiagnosticError: jest.fn(),
  recordDiagnosticEvent: jest.fn(),
}));

// The SDK imports this idle tracing interval even when tracing is disabled.
// It is unrelated to the actual JS event/transport path exercised below.
jest.mock('@sentry/react-native/dist/js/tracing/timeToDisplayFallback', () => ({
  addTimeToInitialDisplayFallback: jest.fn(),
  getTimeToInitialDisplayFallback: jest.fn(async () => null),
}));
// Reinitializing the SDK otherwise allocates native-frame cleanup timers even
// with native collection disabled. Native tracing is outside these JS tests.
jest.mock(
  '@sentry/react-native/dist/js/tracing/integrations/nativeFrames',
  () => ({
    ...jest.requireActual(
      '@sentry/react-native/dist/js/tracing/integrations/nativeFrames',
    ),
    createNativeFramesIntegrations: () => undefined,
  }),
);

test('the actual Sentry JS client captures a sanitized error with native collection disabled', async () => {
  const sent: Sentry.Event[] = [];
  const envelopes: unknown[] = [];
  Sentry.init({
    dsn: 'https://synthetic@example.invalid/1',
    debug: false,
    enableNative: false,
    // Jest does not need the JSC Promise polyfill or Metro debug requests.
    patchGlobalPromise: false,
    integrations: (integrations) =>
      integrations.filter(
        (integration) => integration.name !== 'DebugSymbolicator',
      ),
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    sendDefaultPii: false,
    sendClientReports: false,
    enableLogs: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    release: 'zhihu-minus-minus@0.7.0',
    environment: 'production',
    beforeSend: (event, hint) => {
      hint.attachments = [];
      return sanitizeSentryEvent(event, {
        appVersion: '0.7.0',
        osVersion: '18.0',
        platform: 'ios',
        environment: 'production',
      });
    },
    // A local transport exercises SDK serialization without sending data.
    transport: () => ({
      send: async (envelope) => {
        envelopes.push(envelope);
        for (const [header, payload] of envelope[1]) {
          if (header.type === 'event') sent.push(payload as Sentry.Event);
        }
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });
  try {
    expect(Sentry.getClient()?.getOptions()).toMatchObject({
      enableNative: false,
    });
    const privateValue = 'synthetic-private-detail';
    Sentry.setUser({ email: privateValue });
    Sentry.setContext('device', { name: privateValue });
    Sentry.setExtra('Cookie', privateValue);
    const error = new TypeError(privateValue);
    error.stack = `TypeError: ${privateValue}\n    at example (app:///index.android.bundle:12:7)`;
    Sentry.captureException(error, {
      attachments: [{ filename: privateValue, data: privateValue }],
    });
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain(privateValue);
    expect(JSON.stringify(envelopes)).not.toContain(privateValue);
    expect(sent[0].exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: 'Application failure',
      stacktrace: {
        frames: [{ filename: 'app:///main.jsbundle', lineno: 12, colno: 7 }],
      },
    });
  } finally {
    await Sentry.close();
  }
});

test('the actual SDK honors consent and retains sanitized diagnostics through captureTelemetryException', async () => {
  const sdk = jest.requireActual<typeof import('@sentry/react-native')>(
    '@sentry/react-native',
  );
  const sent: Sentry.Event[] = [];
  const envelopes: unknown[] = [];
  jest.mocked(Sentry.init).mockImplementation((options) => {
    sdk.init({
      ...options,
      patchGlobalPromise: false,
      integrations: (defaults) => {
        const filtered = defaults.filter(
          (integration) => integration.name !== 'DebugSymbolicator',
        );
        return typeof options?.integrations === 'function'
          ? options.integrations(filtered)
          : filtered;
      },
      transport: () => ({
        send: async (envelope) => {
          envelopes.push(envelope);
          for (const [header, payload] of envelope[1]) {
            if (header.type === 'event') sent.push(payload as Sentry.Event);
          }
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
  });
  const telemetry: typeof import('../src/utils/telemetry') = require('../src/utils/telemetry');
  jest.mocked(recordDiagnosticEvent).mockClear();
  try {
    // Identical before/after sanitization deliberately exercises the SDK's
    // Dedupe integration, which runs before our beforeSend startup queue.
    const error = new TypeError('Application failure');
    error.stack = 'TypeError: Application failure';
    Sentry.captureException(error, {
      mechanism: { type: 'onunhandledrejection', handled: true },
    });
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(0);
    expect(recordDiagnosticEvent).toHaveBeenCalledTimes(1);

    await telemetry.setTelemetryEnabled(true);
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(1);
    expect(recordDiagnosticEvent).toHaveBeenCalledTimes(1);

    let resume: (() => void) | undefined;
    let signalProcessing: (() => void) | undefined;
    const processing = new Promise<void>((resolve) => {
      signalProcessing = resolve;
    });
    let delayNext = true;
    Sentry.addEventProcessor((event) => {
      if (!delayNext) return event;
      delayNext = false;
      signalProcessing?.();
      return new Promise((resolve) => {
        resume = () => resolve(event);
      });
    });
    telemetry.captureTelemetryException(
      new RangeError('synthetic-private-detail'),
    );
    await processing;
    await telemetry.setTelemetryEnabled(false);
    await telemetry.setTelemetryEnabled(true);
    resume?.();
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(1);

    const privateValue = 'synthetic-private-cookie';
    Sentry.setUser({ id: privateValue });
    Sentry.setExtra('Cookie', `z_c0=${privateValue}`);
    Sentry.setContext('request', { headers: { Cookie: privateValue } });
    const renderError = new TypeError(
      "Cannot read properties of undefined (reading 'length')",
    );
    Object.assign(renderError, {
      config: { headers: { Cookie: privateValue } },
    });
    renderError.stack = `TypeError: ${renderError.message}\n    at RecentMoments (http://private.invalid/index.bundle?token=${privateValue}:43:9)`;
    rememberDiagnosticContext(renderError, {
      area: 'following.recent-moments',
      operation: 'render',
    });
    telemetry.captureTelemetryException(renderError, 'react-render');
    await Sentry.getClient()?.flush(2000);
    expect(sent).toHaveLength(2);
    expect(sent[1].exception?.values?.[0]).toMatchObject({
      type: 'TypeError',
      value: "Cannot read property 'length' of undefined",
      stacktrace: { frames: [{ lineno: 43, colno: 9 }] },
    });
    expect(sent[1].tags?.error_code).toBe('js.undefined-property');
    expect(sent[1].contexts?.diagnostic).toEqual({
      area: 'following.recent-moments',
      operation: 'render',
    });
    expect(JSON.stringify(sent)).not.toContain(privateValue);
    expect(JSON.stringify(envelopes)).not.toContain(privateValue);
  } finally {
    await Sentry.close();
    jest.mocked(Sentry.init).mockImplementation(sdk.init);
  }
});
