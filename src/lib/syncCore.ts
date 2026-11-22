// Lógica de sincronización sin Firebase (se puede probar en Node).
// Cada dato se sube como una «unidad»: una clave de localStorage, salvo el diario, que va por días
// para no pasar del límite de 1 MiB por documento de Firestore.

import { KEYS } from './backup.ts';

export const DIARIO = 'escaner.diario.v1';
export const META = 'escaner.sync.v1';

/** id de la unidad → JSON. Ids: la clave de localStorage, o «diario/AAAA-MM-DD». */
export type Units = Record<string, string>;

export interface Meta {
  /** Cuenta con la que están enlazados los datos de este dispositivo. */
  uid: string | null;
  email?: string;
  /** Huella de cada unidad tal como está en la nube (última versión confirmada). */
  synced: Record<string, string>;
  /** Cuándo se cambió cada unidad en este dispositivo y aún no se ha confirmado. */
  localT: Record<string, number>;
  last?: number;
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export const isSyncKey = (k: string) => (KEYS as string[]).includes(k);
export const isDayId = (id: string) => id.startsWith('diario/');

/** Huella corta de un texto (FNV-1a + longitud). */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

export function loadMeta(kv: KV): Meta {
  try {
    const m = JSON.parse(kv.getItem(META) ?? 'null');
    if (m && typeof m === 'object') return { uid: m.uid ?? null, email: m.email, synced: m.synced ?? {}, localT: m.localT ?? {}, last: m.last };
  } catch { /* ignorar */ }
  return { uid: null, synced: {}, localT: {} };
}

export function saveMeta(kv: KV, m: Meta): void {
  try { kv.setItem(META, JSON.stringify(m)); } catch { /* ignorar */ }
}

export function readUnits(kv: KV): Units {
  const u: Units = {};
  for (const k of KEYS) {
    const v = kv.getItem(k);
    if (v == null) continue;
    if (k === DIARIO) {
      try {
        const all = JSON.parse(v) as Record<string, unknown[]>;
        for (const [day, entries] of Object.entries(all)) if (Array.isArray(entries) && entries.length) u[`diario/${day}`] = JSON.stringify(entries);
      } catch { /* diario dañado: no se sube */ }
    } else {
      u[k] = v;
    }
  }
  return u;
}

/** Escribe (o borra, con null) una unidad en localStorage. */
export function writeUnit(kv: KV, id: string, value: string | null): void {
  if (isDayId(id)) {
    const day = id.slice(7);
    let all: Record<string, unknown> = {};
    try { all = JSON.parse(kv.getItem(DIARIO) ?? '{}'); } catch { /* ignorar */ }
    if (value == null) delete all[day];
    else all[day] = JSON.parse(value);
    kv.setItem(DIARIO, JSON.stringify(all));
  } else if (value == null) {
    kv.removeItem(id);
  } else {
    kv.setItem(id, value);
  }
}

/** Unidades que han cambiado en este dispositivo desde la última sincronización confirmada. */
export function localChanges(units: Units, m: Meta): { changed: string[]; removed: string[] } {
  const changed = Object.keys(units).filter((id) => m.synced[id] !== hash(units[id]));
  const removed = Object.keys(m.synced).filter((id) => !(id in units));
  return { changed, removed };
}

type Obj = Record<string, any>;
const parse = <T>(s: string, fb: T): T => { try { return JSON.parse(s) as T; } catch { return fb; } };
const pkey = (p: Obj) => p?.code || p?.name;

/**
 * Primera vez que se enlaza un dispositivo que ya tenía datos con una cuenta que también los tiene:
 * las listas se juntan (sin repetir) y, en lo demás, manda la nube.
 */
export function mergeUnit(id: string, local: string, remote: string): string {
  if (isDayId(id)) {
    const r = parse<Obj[]>(remote, []);
    const ids = new Set(r.map((e) => e.id));
    return JSON.stringify([...r, ...parse<Obj[]>(local, []).filter((e) => !ids.has(e.id))]);
  }
  if (id === 'escaner.historial.v1') {
    const byKey = new Map<string, Obj>();
    for (const h of [...parse<Obj[]>(remote, []), ...parse<Obj[]>(local, [])]) {
      const k = pkey(h.product);
      const prev = byKey.get(k);
      if (!prev || String(h.date) > String(prev.date)) byKey.set(k, h);
    }
    return JSON.stringify([...byKey.values()].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 100));
  }
  // Resúmenes por día: se juntan los dos y, si un día está en ambos, manda la nube.
  if (id === 'escaner.resumen.v1') return JSON.stringify({ ...parse<Obj>(local, {}), ...parse<Obj>(remote, {}) });
  if (id === 'escaner.propios.v1') return JSON.stringify({ ...parse<Obj>(local, {}), ...parse<Obj>(remote, {}) });
  if (id === 'escaner.citas.v1') {
    const r = parse<Obj[]>(remote, []);
    const f = new Set(r.map((c) => c.fecha));
    return JSON.stringify([...r, ...parse<Obj[]>(local, []).filter((c) => !f.has(c.fecha))].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))));
  }
  return remote;
}

/** Borra los datos de la app en este dispositivo (al entrar con otra cuenta). */
export function clearLocal(kv: KV): void {
  for (const k of KEYS) kv.removeItem(k);
}
