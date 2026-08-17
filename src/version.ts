import { registerSW } from 'virtual:pwa-register';

declare const __APP_VERSION__: string;
declare const __BUILT_AT__: string;
declare const __CONTENT__: { puzzles: number; collapses: number; openings: number };

export const VERSION = __APP_VERSION__;
export const BUILT_AT = __BUILT_AT__;
export const CONTENT = __CONTENT__;

type State = 'current' | 'updating' | 'ready' | 'offline' | 'unsupported';

let state: State = 'current';
let lastChecked = 0;
const listeners = new Set<(s: State) => void>();

function set(s: State) {
  state = s;
  listeners.forEach(fn => fn(s));
}

export function onUpdateState(fn: (s: State) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function updateState(): State {
  return state;
}

export function lastCheckedAt(): number {
  return lastChecked;
}

let refresh: ((reload?: boolean) => Promise<void>) | undefined;
let registration: ServiceWorkerRegistration | undefined;

if ('serviceWorker' in navigator) {
  refresh = registerSW({
    immediate: true,
    onNeedRefresh() {
      set('ready');
    },
    onRegisteredSW(_url, r) {
      registration = r;
      if (!r) return;
      // A new worker is being installed. On a first ever visit there is no
      // active worker yet, and that is an install rather than an update; if one
      // is already active, this really is a new build replacing it.
      r.addEventListener('updatefound', () => {
        const isUpdate = !!r.active;
        const installing = r.installing;
        if (!installing || !isUpdate) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' || installing.state === 'activated') {
            set('ready');
          }
        });
      });
      // a home-screen app can stay open for days; look for a new build hourly
      setInterval(() => void checkForUpdate(true), 60 * 60 * 1000);
    },
  });
} else {
  state = 'unsupported';
}

/** Ask the server whether a newer build exists. */
export async function checkForUpdate(silent = false): Promise<State> {
  if (!registration) {
    if (!silent) set('unsupported');
    return state;
  }
  if (!silent && state !== 'ready') set('updating');
  try {
    await registration.update();
    lastChecked = Date.now();
    // updatefound flips this to 'ready' when a new build is installing; give
    // that a moment to happen before reporting the result
    await new Promise(r => setTimeout(r, 1200));
    if (state !== 'ready') {
      set(registration.waiting || registration.installing ? 'ready' : 'current');
    }
  } catch {
    set(navigator.onLine ? 'current' : 'offline');
  }
  return state;
}

/** Activate the waiting service worker and reload into the new build. */
export async function applyUpdate() {
  if (refresh) await refresh(true);
  else location.reload();
}
