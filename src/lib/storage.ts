// Historial de productos y productos corregidos a mano (todo en el móvil, localStorage).

import type { Product } from './types.ts';

const HIST = 'escaner.historial.v1';
const CUSTOM = 'escaner.propios.v1';

export interface HistoryItem {
  product: Product;
  date: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* almacenamiento lleno o bloqueado */ }
}

export function loadHistory(): HistoryItem[] {
  return read<HistoryItem[]>(HIST, []);
}

const sameProduct = (a: Product, b: Product) => (a.code && b.code ? a.code === b.code : a.name === b.name);

export function addToHistory(p: Product): void {
  const list = loadHistory().filter((h) => !sameProduct(h.product, p));
  list.unshift({ product: p, date: new Date().toISOString() });
  write(HIST, list.slice(0, 100));
}

export function removeFromHistory(p: Product): void {
  write(HIST, loadHistory().filter((h) => !sameProduct(h.product, p)));
}

/** Productos con código que se han completado o corregido a mano: se usan antes que Open Food Facts. */
export function getCustom(code: string): Product | null {
  return read<Record<string, Product>>(CUSTOM, {})[code] ?? null;
}

export function saveCustom(p: Product): void {
  if (!p.code) return;
  const all = read<Record<string, Product>>(CUSTOM, {});
  all[p.code] = p;
  write(CUSTOM, all);
}
