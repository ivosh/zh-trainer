/** Local progress store: spaced repetition (SM-2) plus simple counters. */

export interface CardState {
  id: string;
  ease: number;      // SM-2 ease factor
  interval: number;  // days
  due: number;       // epoch ms
  reps: number;
  lapses: number;
  lastSeen: number;
}

const KEY = 'zh-trainer-progress-v1';

interface Store {
  cards: Record<string, CardState>;
  stats: {
    solved: number;
    failed: number;
    streak: number;
    bestStreak: number;
    lastDay: string;
    days: string[];
  };
  settings: {
    showHints: boolean;
    boardTheme: string;
  };
}

const empty: Store = {
  cards: {},
  stats: { solved: 0, failed: 0, streak: 0, bestStreak: 0, lastDay: '', days: [] },
  settings: { showHints: true, boardTheme: 'brown' },
};

let store: Store = load();

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(empty);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(empty), ...parsed,
      stats: { ...empty.stats, ...(parsed.stats || {}) },
      settings: { ...empty.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(empty);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage full or unavailable: progress is best-effort */
  }
}

export function getCard(id: string): CardState {
  return store.cards[id] ?? {
    id, ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastSeen: 0,
  };
}

const DAY = 86400000;

/**
 * Grade a card. quality: 0 = failed, 1 = solved with help, 2 = solved cleanly.
 * Intervals stay deliberately gentle - this is for long-term retention,
 * not cramming.
 */
export function grade(id: string, quality: 0 | 1 | 2) {
  const c = getCard(id);
  const now = Date.now();
  if (quality === 0) {
    c.lapses++;
    c.reps = 0;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 10 * 60 * 1000; // retry in 10 minutes
  } else {
    c.reps++;
    if (quality === 1) c.ease = Math.max(1.3, c.ease - 0.05);
    else c.ease = Math.min(3.0, c.ease + 0.1);
    if (c.reps === 1) c.interval = 1;
    else if (c.reps === 2) c.interval = 3;
    else c.interval = Math.round(c.interval * c.ease);
    c.interval = Math.min(c.interval, 180);
    c.due = now + c.interval * DAY;
  }
  c.lastSeen = now;
  store.cards[id] = c;

  const today = new Date().toISOString().slice(0, 10);
  if (quality === 0) {
    store.stats.failed++;
    store.stats.streak = 0;
  } else {
    store.stats.solved++;
    store.stats.streak++;
    store.stats.bestStreak = Math.max(store.stats.bestStreak, store.stats.streak);
  }
  if (store.stats.lastDay !== today) {
    store.stats.lastDay = today;
    if (!store.stats.days.includes(today)) store.stats.days.push(today);
    store.stats.days = store.stats.days.slice(-400);
  }
  save();
}

export function isDue(id: string): boolean {
  return getCard(id).due <= Date.now();
}

export function dueCount(ids: string[]): number {
  const now = Date.now();
  return ids.filter(id => getCard(id).due <= now).length;
}

export function newCount(ids: string[]): number {
  return ids.filter(id => getCard(id).reps === 0 && !store.cards[id]).length;
}

/**
 * Pick the next card: due reviews first (most overdue), then unseen ones.
 * `exclude` holds the cards already shown in this session, so pressing Next
 * keeps moving forward even when nothing has been graded yet.
 */
export function pickNext(ids: string[], exclude?: Iterable<string>): string | undefined {
  const now = Date.now();
  const skip = new Set(exclude ?? []);
  const notSkipped = (id: string) => !skip.has(id);
  const seen = ids.filter(id => store.cards[id]);
  const due = seen
    .filter(id => store.cards[id].due <= now && notSkipped(id))
    .sort((a, b) => store.cards[a].due - store.cards[b].due);
  if (due.length) return due[0];
  const fresh = ids.filter(id => !store.cards[id] && notSkipped(id));
  if (fresh.length) return fresh[0];
  // everything has been shown this session: start over from the least recent
  const rest = ids.filter(notSkipped);
  const pool = rest.length ? rest : ids;
  return pool.slice().sort((a, b) => getCard(a).due - getCard(b).due)[0];
}

export function stats() {
  return { ...store.stats };
}

export function settings() {
  return store.settings;
}

export function setSetting<K extends keyof Store['settings']>(k: K, v: Store['settings'][K]) {
  store.settings[k] = v;
  save();
}

export function studiedToday(): number {
  const today = new Date().toISOString().slice(0, 10);
  return Object.values(store.cards)
    .filter(c => new Date(c.lastSeen).toISOString().slice(0, 10) === today).length;
}

export function resetAll() {
  store = structuredClone(empty);
  save();
}

export function exportProgress(): string {
  return JSON.stringify(store);
}

export function importProgress(json: string): boolean {
  try {
    const p = JSON.parse(json);
    if (!p || typeof p !== 'object' || !p.cards) return false;
    store = { ...structuredClone(empty), ...p };
    save();
    return true;
  } catch {
    return false;
  }
}
