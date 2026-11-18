// Alternativas mejores del mismo tipo de producto y del mismo supermercado (Open Food Facts).

import type { Product } from './types.ts';
import type { Profile } from './profile.ts';
import { evaluate } from './evaluate.ts';
import { FIELDS, fromOff } from './off.ts';

export interface Alternative {
  product: Product;
  score: number;
}

export interface AlternativesResult {
  status: 'ok' | 'sin-categoria' | 'error';
  store: string | null;
  /** Categoría con la que se ha buscado (etiqueta de Open Food Facts). */
  category: string | null;
  current: number;
  items: Alternative[];
  message?: string;
}

const STORE_NAMES: Record<string, string> = {
  mercadona: 'Mercadona', lidl: 'Lidl', carrefour: 'Carrefour', dia: 'Dia', aldi: 'Aldi', alcampo: 'Alcampo', eroski: 'Eroski', consum: 'Consum', hipercor: 'Hipercor', 'el-corte-ingles': 'El Corte Inglés',
};

export const storeName = (tag: string | null) => (tag ? STORE_NAMES[tag] ?? tag.replace(/-/g, ' ') : null);

/** Supermercado del producto: el que indique Open Food Facts o, si es Hacendado, Mercadona. */
export function storeOf(p: Product): string | null {
  const known = (p.stores ?? []).find((s) => STORE_NAMES[s]);
  if (known) return known;
  if (p.stores?.length) return p.stores[0];
  if (/hacendado|deliplus|bosque verde/i.test(p.brand ?? '')) return 'mercadona';
  return null;
}

/** Categorías de la más concreta a la más general (Open Food Facts las da de general a concreta). */
export function categoryChain(p: Product): string[] {
  return [...(p.categories ?? [])].filter((c) => c.startsWith('en:')).reverse().slice(0, 3);
}

const complete = (p: Product) => p.n.kcal != null && p.n.prot != null && p.n.hc != null && p.n.grasa != null;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/** Ordena los candidatos y se queda con los que puntúan claramente mejor que el producto actual. */
export function rankAlternatives(current: Product, candidates: Product[], profile: Profile, max = 3): { current: number; items: Alternative[] } {
  const cur = evaluate(current, profile).score;
  const seen = new Set<string>([norm(current.name)]);
  const items: Alternative[] = [];
  for (const c of candidates) {
    if (c.code && c.code === current.code) continue;
    if (!complete(c) || c.liquid !== current.liquid) continue;
    const key = norm(c.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const score = evaluate(c, profile).score;
    if (score >= cur + 5) items.push({ product: c, score });
  }
  items.sort((a, b) => b.score - a.score);
  return { current: cur, items: items.slice(0, max) };
}

async function search(category: string, store: string | null): Promise<Product[]> {
  const params = new URLSearchParams({ categories_tags: category, fields: `${FIELDS},code`, page_size: '60' });
  if (store) params.set('stores_tags', store);
  else params.set('countries_tags', 'en:spain');
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/search?${params}`);
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  return (json.products ?? []).filter((x: { code?: string }) => x.code).map((x: Record<string, any>) => fromOff(x.code, x));
}

/**
 * Busca en la categoría más concreta y, si salen pocos productos con datos completos, sube a la
 * categoría superior (máximo tres búsquedas).
 */
export async function findAlternatives(current: Product, profile: Profile, onlyStore = true): Promise<AlternativesResult> {
  const store = onlyStore ? storeOf(current) : null;
  const chain = categoryChain(current);
  if (!chain.length) return { status: 'sin-categoria', store, category: null, current: evaluate(current, profile).score, items: [] };
  try {
    let all: Product[] = [];
    let used = chain[0];
    for (const cat of chain) {
      used = cat;
      all = all.concat(await search(cat, store));
      if (all.filter(complete).length >= 8) break;
    }
    const r = rankAlternatives(current, all, profile);
    return { status: 'ok', store, category: used, ...r };
  } catch {
    return { status: 'error', store, category: null, current: evaluate(current, profile).score, items: [], message: 'No se han podido buscar alternativas (sin conexión o Open Food Facts no responde).' };
  }
}

/** «en:digestive-biscuits» → «digestive biscuits». */
export function categoryLabel(tag: string | null): string {
  return tag ? tag.replace(/^en:/, '').replace(/-/g, ' ') : '';
}
