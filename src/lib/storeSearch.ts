// Buscar productos de un supermercado por nombre (Open Food Facts).
//
// La búsqueda por texto solo está en el buscador clásico (/cgi/search.pl): la API v2 filtra por
// etiquetas pero no busca por nombre. Se filtra por supermercado y por país (España), porque
// cadenas como Lidl o Aldi tienen productos de otros países con la misma etiqueta.

import type { Product } from './types.ts';
import { FIELDS, fromOff } from './off.ts';
import { fetchSearch } from './alternatives.ts';

/** Supermercados con productos en Open Food Facts (etiqueta → nombre). Mercadona es el que más tiene. */
export const SUPERS: [tag: string, name: string][] = [
  ['mercadona', 'Mercadona'],
  ['lidl', 'Lidl'],
  ['carrefour', 'Carrefour'],
  ['dia', 'Dia'],
  ['aldi', 'Aldi'],
  ['alcampo', 'Alcampo'],
  ['eroski', 'Eroski'],
  ['consum', 'Consum'],
  ['el-corte-ingles', 'El Corte Inglés'],
  ['hipercor', 'Hipercor'],
  ['ahorramas', 'Ahorramas'],
];

export const PAGE_SIZE = 24;

export function searchUrl(store: string, q: string, page = 1): string {
  const p = new URLSearchParams({
    json: '1',
    action: 'process',
    search_simple: '1',
    search_terms: q.trim(),
    tagtype_0: 'stores',
    tag_contains_0: 'contains',
    tag_0: store,
    tagtype_1: 'countries',
    tag_contains_1: 'contains',
    tag_1: 'spain',
    page_size: String(PAGE_SIZE),
    page: String(page),
    fields: `${FIELDS},code`,
  });
  return `https://world.openfoodfacts.org/cgi/search.pl?${p}`;
}

export const isComplete = (p: Product) => p.n.kcal != null && p.n.prot != null && p.n.hc != null && p.n.grasa != null;

export interface StoreResults {
  products: Product[];
  total: number;
}

/** Busca por nombre en un supermercado. Sin repetir productos con el mismo código. */
export async function searchStore(store: string, q: string, page = 1): Promise<StoreResults> {
  const json = await fetchSearch(searchUrl(store, q, page));
  const seen = new Set<string>();
  const products: Product[] = [];
  for (const x of (json.products ?? []) as Record<string, any>[]) {
    if (!x.code || seen.has(x.code)) continue;
    seen.add(x.code);
    products.push(fromOff(String(x.code), x));
  }
  return { products, total: Number(json.count) || products.length };
}

const KEY = 'escaner.super';
export function loadSuper(): string {
  try {
    const s = localStorage.getItem(KEY);
    if (s && SUPERS.some(([t]) => t === s)) return s;
  } catch { /* sin almacenamiento */ }
  return 'mercadona';
}
export function saveSuper(s: string): void {
  try { localStorage.setItem(KEY, s); } catch { /* ignorar */ }
}
