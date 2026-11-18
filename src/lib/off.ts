// Búsqueda por código de barras en Open Food Facts (base de datos abierta, sin clave).

import type { Product, Nutrients } from './types.ts';
import { parseUnit } from './serving.ts';

export const FIELDS = [
  'product_name', 'product_name_es', 'generic_name_es', 'brands', 'quantity', 'serving_size',
  'nova_group', 'nutriscore_grade', 'categories_tags', 'stores_tags', 'image_front_small_url', 'nutriments',
].join(',');

export type OffResult =
  | { status: 'ok'; product: Product; incomplete: boolean }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

const v = (x: unknown): number | null => (typeof x === 'number' && isFinite(x) ? x : typeof x === 'string' && x !== '' && isFinite(+x) ? +x : null);

/** Categorías de Open Food Facts que son bebidas (leche, zumos, refrescos, bebidas vegetales…). */
const LIQUID_CATS = /^en:(beverages|drinks|waters|milks|.*-milks|plant-based-milk-alternatives|.*-beverages|juices|fruit-juices|.*-juices|sodas|soft-drinks|.*-drinks|drinkable-yogurts|coffee-drinks|tea-based-beverages)$/;
const NOT_LIQUID_CATS = /^en:(plant-based-foods-and-beverages|.*-foods-and-beverages|beverages-and-beverages-preparations|.*-preparations|.*-powders|powdered-.*|instant-.*)$/;

/**
 * ¿Se mide en ml? Manda la unidad de la cantidad del envase («1 l», «500 g»). Si no la hay, se mira
 * la categoría, con cuidado: Open Food Facts mete la pasta, el arroz o el aceite en «Plant-based foods
 * and beverages», que no es una bebida.
 */
export function isLiquid(cats: string[], quantity?: string | null): boolean {
  const q = (quantity ?? '').toLowerCase();
  if (/\d\s*(ml|cl|l|litros?)\b/.test(q)) return true;
  if (/\d\s*(g|gr|kg|gramos?)\b/.test(q)) return false;
  return cats.some((c) => LIQUID_CATS.test(c) && !NOT_LIQUID_CATS.test(c));
}

/** Platos y salsas que pueden venir en ml pero no son bebidas. */
const FOOD_CATS = /^en:(soups|.*-soups|gazpachos?|salmorejos?|sauces|.*-sauces|tomato-.*|purees|.*-purees|creams|cooking-.*|condiments|oils|.*-oils|vinegars|yogurts|.*-yogurts|desserts|.*-desserts)$/;

/** ¿Se valora como bebida? Solo bebidas de verdad, nunca sopas, salsas, aceites ni yogures. */
export function isDrink(cats: string[]): boolean {
  if (cats.some((c) => FOOD_CATS.test(c))) return false;
  return cats.some((c) => LIQUID_CATS.test(c) && !NOT_LIQUID_CATS.test(c));
}

export function fromOff(code: string, p: Record<string, any>): Product {
  const nu = p.nutriments ?? {};
  let kcal = v(nu['energy-kcal_100g']);
  if (kcal == null && v(nu['energy-kj_100g']) != null) kcal = Math.round(v(nu['energy-kj_100g'])! / 4.184);
  if (kcal == null && v(nu['energy_100g']) != null) kcal = Math.round(v(nu['energy_100g'])! / 4.184); // energy_100g va en kJ
  const n: Nutrients = {
    kcal,
    prot: v(nu.proteins_100g),
    hc: v(nu.carbohydrates_100g),
    azucar: v(nu.sugars_100g),
    grasa: v(nu.fat_100g),
    sat: v(nu['saturated-fat_100g']),
    fibra: v(nu.fiber_100g),
    sal: v(nu.salt_100g),
  };
  const cats: string[] = p.categories_tags ?? [];
  const liquid = isLiquid(cats, p.quantity);
  const unit = parseUnit(p.serving_size, p.quantity);
  return {
    code,
    name: (p.product_name_es || p.product_name || p.generic_name_es || 'Producto sin nombre').trim(),
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    image: p.image_front_small_url || undefined,
    n,
    liquid,
    drink: isDrink(cats),
    nova: v(p.nova_group) ?? undefined,
    nutriscore: typeof p.nutriscore_grade === 'string' && /^[a-e]$/.test(p.nutriscore_grade) ? p.nutriscore_grade : undefined,
    unitWeight: unit?.weight,
    unitName: unit?.name,
    categories: cats,
    stores: Array.isArray(p.stores_tags) ? p.stores_tags : undefined,
    quantity: typeof p.quantity === 'string' ? p.quantity : undefined,
    source: 'openfoodfacts',
  };
}

export async function lookupBarcode(code: string): Promise<OffResult> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}&lc=es`);
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) return { status: 'error', message: `Open Food Facts respondió ${res.status}` };
    const json = await res.json();
    if (json.status !== 1 || !json.product) return { status: 'not-found' };
    const product = fromOff(code, json.product);
    const n = product.n;
    const incomplete = n.kcal == null || n.prot == null || n.hc == null || n.grasa == null;
    return { status: 'ok', product, incomplete };
  } catch (e) {
    return { status: 'error', message: 'No hay conexión con Open Food Facts. Revisa internet o haz una foto de la tabla nutricional.' };
  }
}
