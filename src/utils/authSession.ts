import CookieManager from '@preeternal/react-native-cookie-manager';
import * as SecureStore from 'expo-secure-store';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { createNativeSessionSynchronizer } from './nativeSessionSync';

export const LEGACY_COOKIE_STORAGE_KEY = 'user_cookies';
const SECURE_STORE_SAFE_COOKIE_LENGTH = 2000;
const synchronize = createNativeSessionSynchronizer({
  isCurrent: (version) => getAuthSessionVersion() === version,
  getCookies: () => useAuthStore.getState().cookies,
  clear: () => CookieManager.clearAllStores(),
  setCookie: (name, value) =>
    CookieManager.set(
      'https://www.zhihu.com',
      { name, value, domain: '.zhihu.com', path: '/', secure: true },
      true,
    ),
  saveLegacy: (cookies) =>
    cookies && cookies.length < SECURE_STORE_SAFE_COOKIE_LENGTH
      ? SecureStore.setItemAsync(LEGACY_COOKIE_STORAGE_KEY, cookies)
      : SecureStore.deleteItemAsync(LEGACY_COOKIE_STORAGE_KEY),
});
let pendingSynchronization: Promise<void> = Promise.resolve();
let synchronizationStartedAt = 0;
export const NATIVE_SESSION_SYNC_TIMEOUT_MS = 5000;

/** Readers must not use the old native jar while a selected session is mirrored. */
export async function waitForNativeSessionCookies(): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settled = async () => {
    let pending: Promise<void>;
    do {
      pending = pendingSynchronization;
      await pending;
    } while (pending !== pendingSynchronization);
    return true;
  };
  try {
    // Axios has not reached its transport timeout while this interceptor waits.
    // On timeout callers can browse without reading the possibly stale jar.
    return await Promise.race([
      settled(),
      new Promise<false>((resolve) => {
        timeout = setTimeout(
          () => resolve(false),
          Math.max(
            0,
            NATIVE_SESSION_SYNC_TIMEOUT_MS -
              (Date.now() - synchronizationStartedAt),
          ),
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

/** Zustand is authoritative; obsolete native writes stop at each async boundary. */
export function syncNativeSessionCookies(
  _cookies: string | null,
): Promise<void> {
  // The caller's snapshot may rotate while it awaits account persistence.
  // Always mirror the selected session, including its latest response cookies.
  const pending = synchronize(getAuthSessionVersion());
  // The initiating UI reports failures. Reads can still use the selected
  // in-memory session or continue without native credentials after a failure.
  synchronizationStartedAt = Date.now();
  pendingSynchronization = pending.catch(() => undefined);
  return pending;
}
