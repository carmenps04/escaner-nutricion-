// Plan del dietista: raciones de cada comida, opciones, límites de verdura y tabla de fruta.
// Se guarda solo en el dispositivo (no va en el código, que es público).

import type { Product } from './types.ts';
import type { Portion } from './evaluate.ts';

export type PlanMeal = 'desayuno' | 'mediaManana' | 'comida' | 'merienda' | 'cena';

export interface PlanGroup {
  /** «Hidratos», «Proteína», «Grasa»… o vacío si son opciones completas. */
  grupo?: string;
  opciones: string[];
}

export interface PlanMealDay {
  /** Nombre que usa el dietista: «Desayuno», «Ingesta post-entrenamiento»… */
  titulo: string;
  /** Raciones HC·P·G de esa comida (1 ración = 10 g). */
  raciones: string;
  grupos: PlanGroup[];
  nota?: string;
}

export interface DietPlan {
  fecha: string;
  comidas: {
    descanso: Partial<Record<PlanMeal, PlanMealDay>>;
    entreno: Partial<Record<PlanMeal, PlanMealDay>>;
  };
  verdura: { limite: number; limitadas: string[]; libres: string[]; texto: string };
  /** Gramos de cada fruta que hacen 1 ración (10 g de hidratos). */
  fruta: { gramos: number; frutas: string[] }[];
  notas: string[];
}

const KEY = 'escaner.plan.v1';

export function loadPlan(): DietPlan | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DietPlan) : null;
  } catch {
    return null;
  }
}

export function deletePlan(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignorar */ }
}

/** Nombre de comida de la app → comida del plan. */
export const MEAL_KEY: Record<string, PlanMeal> = {
  Desayuno: 'desayuno',
  'Media mañana': 'mediaManana',
  Almuerzo: 'comida',
  Merienda: 'merienda',
  Cena: 'cena',
};

export interface Target {
  titulo: string;
  raciones: string;
  hc: number;
  prot: number;
  grasa: number;
}

export function mealTarget(plan: DietPlan | null, meal: string, entreno: boolean): (Target & { day: PlanMealDay }) | null {
  const key = MEAL_KEY[meal];
  const day = key ? plan?.comidas[entreno ? 'entreno' : 'descanso'][key] : undefined;
  if (!day) return null;
  const m = day.raciones.match(/(\d+)\D+(\d+)\D+(\d+)/);
  if (!m) return null;
  return { titulo: day.titulo, raciones: day.raciones, hc: +m[1] * 10, prot: +m[2] * 10, grasa: +m[3] * 10, day };
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const VEG_CATS = /^en:((fresh|frozen|canned|dried)-)?(fruits|vegetables|tomatoes|onions|carrots|beetroots|sweet-corns?|cucumbers|zucchinis?|courgettes|eggplants|aubergines|spinachs?|lettuces?|salads|tomato-sauces|crushed-tomatoes|peeled-tomatoes|tomato-purees)$/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ¿El producto es esa verdura o fruta? Por el nombre (empieza por la palabra, también en plural) o,
 * si es un alimento natural o de categoría fruta/verdura, porque la palabra aparece en el nombre.
 * «Col» no debe coincidir con «Cola Cao» ni «Pera» con «Perlas».
 */
function isFood(p: Product, words: string[]): boolean {
  const name = norm(p.name);
  const natural = p.source === 'tabla';
  // Categorías de fruta o verdura «tal cual» (no «fruit-yogurts» ni «corn-cakes»).
  const vegCat = (p.categories ?? []).some((c) => VEG_CATS.test(c));
  return words.some((w) => {
    const k = esc(norm(w));
    if (new RegExp(`^${k}(s|es)?\\b`).test(name)) return true;
    return (natural || vegCat) && new RegExp(`\\b${k}(s|es)?\\b`).test(name);
  });
}

/** Regla de verdura del dietista para este producto. */
export function vegRule(plan: DietPlan | null, p: Product): 'limitada' | 'libre' | null {
  if (!plan) return null;
  if (isFood(p, plan.verdura.limitadas)) return 'limitada';
  if (isFood(p, plan.verdura.libres)) return 'libre';
  return null;
}

/** Gramos de una ración de fruta (10 g de hidratos) según la tabla del dietista. La fruta seca va primero en la tabla para que «uvas pasas» no cuente como uvas. */
export function fruitPortion(plan: DietPlan | null, p: Product): number | null {
  if (!plan) return null;
  for (const f of plan.fruta) if (isFood(p, f.frutas)) return f.gramos;
  return null;
}

export interface PlanPortion {
  portion: Portion;
  /** Texto en grande cuando la pauta es «libre». */
  label?: string;
}

/**
 * Aplica la pauta del dietista a la cantidad máxima de la app:
 * verdura limitada → como mucho el límite por comida (si la app ya da menos, se queda lo de la app);
 * verdura libre → cantidad libre.
 */
export function planPortion(plan: DietPlan | null, p: Product, base: Portion, dayKcal: number): PlanPortion {
  const rule = vegRule(plan, p);
  if (!plan || !rule) return { portion: base };
  if (rule === 'libre') return { portion: { ...base, grams: null, units: null, kcal: null, pctDayKcal: null, prot: null, hc: null, grasa: null, limitedBy: 'tu dietista: verdura libre' }, label: 'Cantidad libre' };
  const lim = plan.verdura.limite;
  if (base.grams != null && base.grams <= lim) return { portion: base };
  const n = p.n;
  const at = (v: number | null) => (v == null ? null : (v * lim) / 100);
  const kcal = at(n.kcal);
  return {
    portion: {
      grams: lim,
      units: p.unitWeight ? Math.floor(lim / p.unitWeight) : null,
      limitedBy: `tu dietista (máximo ${lim} g por comida)`,
      kcal,
      pctDayKcal: kcal != null && dayKcal > 0 ? (kcal / dayKcal) * 100 : null,
      prot: at(n.prot),
      hc: at(n.hc),
      grasa: at(n.grasa),
    },
  };
}

/** Raciones de fruta que son esos gramos (redondeado a medias raciones). */
export function fruitRaciones(gramsPerRacion: number, grams: number): number {
  return Math.round((grams / gramsPerRacion) * 2) / 2;
}
