// Diario del día: lo que se come, por fecha, y lo que queda del plan.

import type { Product, Nutrients } from './types.ts';
import type { DayPlan } from './profile.ts';

export interface DiaryEntry {
  id: string;
  time: string; // HH:MM
  name: string;
  brand?: string;
  /** Gramos o ml consumidos; null en las entradas a mano (solo con kcal y macros). */
  grams: number | null;
  units?: number;
  unitName?: string;
  kcal: number;
  prot: number;
  hc: number;
  grasa: number;
  /** Producto completo, para poder volver a valorarlo. */
  product?: Product;
  /** Comidas con varios ingredientes (desayuno: leche + galletas…). */
  items?: MealItem[];
}

/** Un ingrediente de una comida: un producto ya escaneado y la cantidad tomada. */
export interface MealItem {
  product: Product;
  /** Cantidad en la unidad elegida. */
  qty: number;
  /** 'unidad' = unidades del producto (galletas…); 'g' = gramos o ml. */
  unit: 'unidad' | 'g';
}

/** Gramos (o ml) de un ingrediente. */
export function itemGrams(i: MealItem): number {
  return i.unit === 'unidad' && i.product.unitWeight ? i.qty * i.product.unitWeight : i.qty;
}

export function mealTotals(items: MealItem[]): Totals {
  return items.reduce((t, i) => {
    const x = forGrams(i.product.n, itemGrams(i));
    return { kcal: t.kcal + x.kcal, prot: t.prot + x.prot, hc: t.hc + x.hc, grasa: t.grasa + x.grasa };
  }, { kcal: 0, prot: 0, hc: 0, grasa: 0 });
}

export interface Totals {
  kcal: number;
  prot: number;
  hc: number;
  grasa: number;
}

const KEY = 'escaner.diario.v1';
const KEEP_DAYS = 120;

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function readAll(): Record<string, DiaryEntry[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, DiaryEntry[]>): void {
  const keys = Object.keys(all).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete all[k];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* almacenamiento lleno */ }
}

/** Todo el diario (día → comidas). */
export function loadAllDays(): Record<string, DiaryEntry[]> {
  return readAll();
}

/** Comidas del día, en orden, con su hora habitual (se puede cambiar al apuntarla). */
export const MEALS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];
export const MEAL_TIMES: Record<string, string> = {
  Desayuno: '08:30',
  'Media mañana': '11:30',
  Almuerzo: '13:30',
  Merienda: '15:00',
  Cena: '21:00',
};

/** Comida que se propone al añadir: la primera del día que aún no está apuntada. */
export function nextMeal(taken: string[]): string {
  return MEALS.find((m) => !taken.includes(m)) ?? 'Cena';
}

export function loadDay(day = dayKey()): DiaryEntry[] {
  return (readAll()[day] ?? []).sort((a, b) => a.time.localeCompare(b.time));
}

export function addEntry(e: Omit<DiaryEntry, 'id' | 'time'> & { time?: string }, day = dayKey()): void {
  if (!e.time) delete e.time;
  const all = readAll();
  const now = new Date();
  const time = e.time ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  all[day] = [...(all[day] ?? []), { ...e, time, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
  writeAll(all);
}

export function removeEntry(id: string, day = dayKey()): void {
  const all = readAll();
  all[day] = (all[day] ?? []).filter((e) => e.id !== id);
  if (!all[day].length) delete all[day];
  writeAll(all);
}

export function updateEntry(id: string, patch: Partial<DiaryEntry>, day = dayKey()): void {
  const all = readAll();
  all[day] = (all[day] ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e));
  writeAll(all);
}

/** Valores de una cantidad de producto (por 100 g → gramos consumidos). */
export function forGrams(n: Nutrients, grams: number): Totals {
  const f = grams / 100;
  return { kcal: (n.kcal ?? 0) * f, prot: (n.prot ?? 0) * f, hc: (n.hc ?? 0) * f, grasa: (n.grasa ?? 0) * f };
}

export function totals(entries: DiaryEntry[]): Totals {
  return entries.reduce((t, e) => ({ kcal: t.kcal + e.kcal, prot: t.prot + e.prot, hc: t.hc + e.hc, grasa: t.grasa + e.grasa }), { kcal: 0, prot: 0, hc: 0, grasa: 0 });
}

export function remaining(plan: DayPlan, t: Totals): Totals {
  return { kcal: plan.kcal - t.kcal, prot: plan.prot - t.prot, hc: plan.hc - t.hc, grasa: plan.grasa - t.grasa };
}

/**
 * Gramos máximos que caben en lo que queda del día (calorías, hidratos y grasa). La proteína no
 * limita: pasarse un poco de proteína no es un problema en un déficit.
 */
export function gramsLeft(n: Nutrients, left: Totals): { grams: number; by: 'kcal' | 'hc' | 'grasa' } | null {
  const caps: { g: number; by: 'kcal' | 'hc' | 'grasa' }[] = [];
  if (n.kcal && n.kcal > 0) caps.push({ g: (Math.max(0, left.kcal) / n.kcal) * 100, by: 'kcal' });
  if (n.hc && n.hc > 0) caps.push({ g: (Math.max(0, left.hc) / n.hc) * 100, by: 'hc' });
  if (n.grasa && n.grasa > 0) caps.push({ g: (Math.max(0, left.grasa) / n.grasa) * 100, by: 'grasa' });
  if (!caps.length) return null;
  const best = caps.reduce((a, b) => (b.g < a.g ? b : a));
  return { grams: best.g, by: best.by };
}

export interface PastMeal {
  name: string;
  items: MealItem[];
  day: string;
  time: string;
  kcal: number;
}

/**
 * Comidas anteriores con productos (las más recientes primero), sin repetir las que llevan los mismos
 * productos y cantidades. Sirve para volver a apuntar el desayuno de siempre de un toque.
 */
export function pastMeals(limit = 20): PastMeal[] {
  const all = readAll();
  const out: PastMeal[] = [];
  const seen = new Set<string>();
  for (const day of Object.keys(all).sort().reverse()) {
    const entries = [...all[day]].sort((a, b) => b.time.localeCompare(a.time));
    for (const e of entries) {
      if (!e.items?.length) continue;
      const sig = `${e.name}|${e.items.map((i) => `${i.product.code ?? i.product.name}:${i.qty}${i.unit}`).join(',')}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ name: e.name, items: e.items, day, time: e.time, kcal: e.kcal });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export type KcalLevel = 'ok' | 'alto' | 'malo';

/**
 * Cómo de grave es pasarse de calorías. El plan lleva un déficit (mantenimiento − plan); pasarse se come
 * parte de ese déficit:
 * - hasta un 2 % por encima: en el objetivo;
 * - hasta perder la mitad del déficit del día: naranja (sigues en déficit, afecta poco);
 * - más de la mitad del déficit, o por encima del mantenimiento: rojo.
 * Sin datos de gasto (o sin déficit en el plan), el rojo empieza al pasar un 10 % del plan.
 */
export function kcalLevel(kcal: number, planKcal: number, maintenance: number): { level: KcalLevel; redFrom: number; sinDeficit: boolean } {
  const deficit = maintenance - planKcal;
  const redFrom = Math.round(deficit >= 100 ? planKcal + deficit / 2 : planKcal * 1.1);
  const sinDeficit = deficit >= 100 && kcal > maintenance;
  const level: KcalLevel = kcal <= planKcal * 1.02 ? 'ok' : kcal <= redFrom ? 'alto' : 'malo';
  return { level, redFrom, sinDeficit };
}
