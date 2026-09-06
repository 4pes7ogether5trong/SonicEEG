import { mergeBaseline } from './baseline.js';
import { chooseWaveform } from './waveform.js';
export function mergeBins(a, b) {
  const mixed = a.mixed || b.mixed || a.segment !== b.segment,
    start = a.start,
    end = b.end;
  const names = [...new Set([...a.channels, ...b.channels].map((c) => c.name))];
  const channels = names.map((name) => {
    const x = a.channels.find((c) => c.name === name),
      y = b.channels.find((c) => c.name === name);
    const validSeconds = (x?.validSeconds || 0) + (y?.validSeconds || 0),
      vw = validSeconds || 1;
    return {
      name,
      status: x?.status === y?.status ? x.status : 'mixed',
      valid: validSeconds > 0 && !mixed,
      validSeconds,
      baseline: mergeBaseline(x?.baseline, y?.baseline),
      sharpCount: (x?.sharpCount || 0) + (y?.sharpCount || 0),
      sharpValidSeconds: (x?.sharpValidSeconds || 0) + (y?.sharpValidSeconds || 0),
      rms: Math.sqrt(
        ((x?.rms || 0) ** 2 * (x?.validSeconds || 0) +
          (y?.rms || 0) ** 2 * (y?.validSeconds || 0)) /
          vw,
      ),
      bands: Array.from(
        { length: 5 },
        (_, i) =>
          ((x?.bands?.[i] || 0) * (x?.validSeconds || 0) +
            (y?.bands?.[i] || 0) * (y?.validSeconds || 0)) /
          vw,
      ),
      peakBands: Array.from({ length: 5 }, (_, i) =>
        Math.max(x?.peakBands?.[i] ?? x?.bands?.[i] ?? 0, y?.peakBands?.[i] ?? y?.bands?.[i] ?? 0),
      ),
      amplitudeHistogram: Array.from({ length: 5 }, (_, i) => {
        const bins = { ...x?.amplitudeHistogram?.[i] };
        for (const [k, v] of Object.entries(y?.amplitudeHistogram?.[i] || {}))
          bins[k] = (bins[k] || 0) + v;
        return bins;
      }),
      min: Math.min(x?.min ?? 0, y?.min ?? 0),
      max: Math.max(x?.max ?? 0, y?.max ?? 0),
      last: y?.last ?? 0,
      affected: Array.from({ length: 5 }, (_, i) => !!(x?.affected?.[i] || y?.affected?.[i])),
      unknownFilters: x?.unknownFilters || y?.unknownFilters,
      peakHz: y?.peakHz ?? x?.peakHz ?? 0,
      quality: Math.min(x?.quality ?? 0, y?.quality ?? 0),
    };
  });
  return {
    start,
    end,
    channels,
    waveform: chooseWaveform(a.waveform, b.waveform, mixed),
    segment: mixed ? 'mixed' : a.segment,
    mixed,
    leaves: (a.leaves || 1) + (b.leaves || 1),
    settings: mixed ? {} : a.settings,
    gaps: (a.gaps || 0) + (b.gaps || 0),
    source: a.source,
  };
}
export function summarizeFrames(frames, limit = 16) {
  let bins = frames.slice();
  while (bins.length > limit) {
    const next = [];
    for (let i = 0; i < bins.length; i += 2)
      next.push(bins[i + 1] ? mergeBins(bins[i], bins[i + 1]) : bins[i]);
    bins = next;
  }
  return bins;
}
export class TemporalHistory {
  constructor(capacity = 160) {
    this.capacity = capacity;
    this.levels = [[]];
    this.end = 0;
    this.count = 0;
    this.source = null;
  }
  add(frame) {
    if (frame.start < this.end - 1e-5) throw new Error('History cannot overlap or run backwards');
    this.end = frame.end;
    this.count++;
    this.levels[0].push(frame);
    this.compact(0);
  }
  compact(level) {
    if (this.levels[level].length <= this.capacity) return;
    const merged = mergeBins(this.levels[level].shift(), this.levels[level].shift());
    this.levels[level + 1] ??= [];
    this.levels[level + 1].push(merged);
    this.compact(level + 1);
  }
  bins() {
    return this.levels.flat().sort((a, b) => a.start - b.start);
  }
  select(time) {
    return this.bins().find((f) => f.start <= time && f.end > time) || this.bins().at(-1);
  }
  overview(limit = 16) {
    return summarizeFrames(this.bins(), limit);
  }
  invalidateSince(time) {
    for (const f of this.bins())
      if (f.end > time) {
        f.settingsUncertain = true;
        f.waveform = null;
        f.channels.forEach((c) => {
          c.valid = false;
          c.validSeconds = 0;
          c.baseline = null;
        });
      }
  }
}
export class LocalArchive {
  async open() {
    if (!globalThis.indexedDB) throw new Error('Local browser storage unavailable');
    this.db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('soniceeg-local-v2', 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore('sessions', { keyPath: 'id' });
        const frames = r.result.createObjectStore('frames', {
          keyPath: ['session', 'start'],
        });
        frames.createIndex('session', 'session');
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async transaction(stores, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, mode);
      fn(tx);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Local save aborted'));
    });
  }
  async create(source) {
    const id = crypto.randomUUID();
    this.id = id;
    await this.transaction(['sessions'], 'readwrite', (tx) =>
      tx.objectStore('sessions').put({ id, created: Date.now(), source, end: 0 }),
    );
    return id;
  }
  async append(frame, id = this.id) {
    if (!id) return;
    await this.transaction(['frames'], 'readwrite', (tx) =>
      tx.objectStore('frames').put({ ...frame, session: id }),
    );
  }
  async sessions() {
    return new Promise((resolve, reject) => {
      const r = this.db.transaction('sessions').objectStore('sessions').getAll();
      r.onsuccess = () => resolve(r.result.sort((a, b) => b.created - a.created));
      r.onerror = () => reject(r.error);
    });
  }
  async frames(session, start = 0, end = Infinity) {
    return new Promise((resolve, reject) => {
      const result = [],
        range = IDBKeyRange.bound(
          [session, start],
          [session, Number.isFinite(end) ? end : Number.MAX_VALUE],
        );
      const r = this.db.transaction('frames').objectStore('frames').openCursor(range);
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          result.push(c.value);
          c.continue();
        } else resolve(result);
      };
      r.onerror = () => reject(r.error);
    });
  }
  async visit(session, fn) {
    return new Promise((resolve, reject) => {
      const r = this.db
        .transaction('frames')
        .objectStore('frames')
        .index('session')
        .openCursor(IDBKeyRange.only(session));
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          fn(c.value);
          c.continue();
        } else resolve();
      };
      r.onerror = () => reject(r.error);
    });
  }
  async invalidateSince(session, time) {
    await this.transaction(['frames'], 'readwrite', (tx) => {
      const r = tx
        .objectStore('frames')
        .openCursor(
          IDBKeyRange.bound([session, Math.max(0, time - 2)], [session, Number.MAX_VALUE]),
        );
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          const f = c.value;
          if (f.end > time) {
            f.settingsUncertain = true;
            f.waveform = null;
            f.channels.forEach((x) => {
              x.valid = false;
              x.validSeconds = 0;
              x.baseline = null;
            });
            c.update(f);
          }
          c.continue();
        }
      };
    });
  }
  async erase(session) {
    await this.transaction(['sessions', 'frames'], 'readwrite', (tx) => {
      tx.objectStore('sessions').delete(session);
      const r = tx.objectStore('frames').index('session').openCursor(IDBKeyRange.only(session));
      r.onsuccess = () => {
        const c = r.result;
        if (c) {
          c.delete();
          c.continue();
        }
      };
    });
  }
}
