import { useCallback, useEffect, useState } from 'react';

export const APP_BUILD = __APP_BUILD__;
const CHECK_INTERVAL = 30 * 60 * 1000;

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'offline' | 'updating';

/** Reads the version.json published with the live site. It is never cached by the service worker. */
async function deployedBuild(): Promise<string | null> {
  const response = await fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json() as { build?: unknown };
  return typeof data.build === 'string' ? data.build : null;
}

/** Installs the newest service worker (and its files), then reloads into the new release. */
export async function applyUpdate(): Promise<void> {
  const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
  if (registration) {
    await registration.update().catch(() => undefined);
    const worker = registration.installing || registration.waiting;
    if (worker) await new Promise<void>(resolve => {
      const done = () => { if (worker.state === 'activated' || worker.state === 'redundant') resolve(); };
      worker.addEventListener('statechange', done); done();
      setTimeout(resolve, 15000);
    });
  }
  location.reload();
}

/** Checks for a newer deployment on load, when the app returns to the foreground, and every 30 minutes. */
export function useUpdateCheck() {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const enabled = import.meta.env.PROD;

  const check = useCallback(async (): Promise<UpdateStatus> => {
    if (!enabled) { setStatus('current'); return 'current'; }
    if (!navigator.onLine) { setStatus('offline'); return 'offline'; }
    setStatus(previous => previous === 'available' ? previous : 'checking');
    try {
      const latest = await deployedBuild();
      const next: UpdateStatus = latest && latest !== APP_BUILD.build ? 'available' : 'current';
      setStatus(next); return next;
    } catch { setStatus('offline'); return 'offline'; }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(() => void check(), 3000);
    const timer = setInterval(() => void check(), CHECK_INTERVAL);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => { clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onVisible); };
  }, [enabled, check]);

  const update = useCallback(async () => { setStatus('updating'); await applyUpdate(); }, []);
  return { status, check, update };
}
