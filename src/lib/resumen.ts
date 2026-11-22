// Resúmenes semanal, mensual y anual.
//
// El diario solo guarda los últimos 120 días. Para no perder las semanas antiguas, cada día se resume
// en pocos números (calorías, macros, plan del día, alcohol y productos de consumo ocasional) y ese
// resumen se guarda aparte, sin borrarse nunca. Semanas, meses y años se calculan a partir de ahí.
//
// Nota del día (0–10), según las calorías frente al plan:
// - entre el 90 % y el 102 % del plan: 10;
// - por debajo del 90 %: baja 2,5 puntos por cada 10 % que falta (70 % = 5; 50 % = 0);
// - por encima, la misma escala que el diario: naranja (sigues en déficit) entre 7,9 y 5; rojo
//   (pierdes más de la mitad del déficit) por debajo de 5.
// Verde ≥ 8, amarillo 5–7,9, rojo < 5. Los umbrales son criterio de la app, no del dietista.

import { dayKey, forGrams, itemGrams, kcalLevel, loadAllDays, type DiaryEntry } from './diary.ts';
import type { Profile } from './profile.ts';
import type { Product } from './types.ts';
import { evaluate } from './evaluate.ts';
import { dowOf, today as todayOf } from './training.ts';

export const RESUMEN = 'escaner.resumen.v1';

export interface Alcohol {
  /** ml de cerveza */
  cerveza: number;
  /** ml de vino, sidra, vermut… */
  vino: number;
  /** combinados o chupitos */
  copas: number;
  /** unidades de bebida estándar (10 g de alcohol) */
  ube: number;
  kcal: number;
}

export interface DaySum {
  kcal: number;
  prot: number;
  hc: number;
  grasa: number;
  plan: { kcal: number; prot: number; hc: number; grasa: number };
  /** Gasto del día (mantenimiento), para saber cuándo pasarse se come el déficit. */
  mant: number;
  entreno: boolean;
  /** Ya está apuntada la cena: el día de hoy cuenta para la nota. */
  cena: boolean;
  alc?: Alcohol;
  /** Productos de consumo ocasional tomados ese día (uno por toma). */
  ocas?: string[];
}

// ───────────── Fechas ─────────────

export const parseDay = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const weekStart = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), -dowOf(d));
export const weekDays = (d: Date) => Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart(d), i)));
export const monthDays = (y: number, m: number) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => dayKey(new Date(y, m, i + 1)));
/** Lunes de cada semana que toca el mes. */
export function monthWeeks(y: number, m: number): Date[] {
  const out: Date[] = [];
  for (let d = weekStart(new Date(y, m, 1)); d <= new Date(y, m + 1, 0); d = addDays(d, 7)) out.push(d);
  return out;
}
const daysBetween = (a: string, b: string) => Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);

// ───────────── Alcohol ─────────────

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export type Drink = 'cerveza' | 'vino' | 'copa';

/** Tipo de bebida alcohólica por el nombre o las categorías de Open Food Facts; null si no lo es. */
export function drinkKind(name: string, categories: string[] = []): Drink | null {
  const t = norm(name);
  const c = categories.join(' ');
  if (/sin alcohol|0[,.]0|\b0 ?%|\bsin\b(?! gluten)/.test(t) || /non-alcoholic|alcohol-free/.test(c)) return null;
  if (/cerveza|\bbirra|\btercio|\blager\b|\bipa\b|pilsen|\bradler\b|shandy/.test(t) || c.includes('en:beers')) return 'cerveza';
  if (/\bvino|tinto de verano|sangria|\bcava\b|champa(n|gne)|vermut|vermouth|\bsidra|rebujito/.test(t) || /en:wines|en:ciders/.test(c)) return 'vino';
  if (/\bron\b|ginebra|\bgin\b|whisk|vodka|tequila|licor|cubata|chupito|combinado|coctel|mojito|baileys|pacharan|orujo/.test(t) || /en:spirits|en:liqueurs|en:cocktails|en:alcoholic-beverages/.test(c)) return 'copa';
  return null;
}

/** Gramos de alcohol: ml × graduación × 0,8. Cerveza 5 %, vino 12 %; un combinado ≈ 2 UBE. */
function addDrink(a: Alcohol, kind: Drink, ml: number | null, units: number, kcal: number) {
  if (kind === 'cerveza') {
    const v = ml ?? units * 330;
    a.cerveza += v;
    a.ube += (v * 0.05 * 0.8) / 10;
  } else if (kind === 'vino') {
    const v = ml ?? units * 150;
    a.vino += v;
    a.ube += (v * 0.12 * 0.8) / 10;
  } else {
    // Hasta 100 ml se entiende que es la bebida sola (chupitos de 30 ml); más, un combinado con refresco.
    const n = ml == null ? units : ml <= 100 ? ml / 30 / 2 : ml / 250;
    a.copas += n;
    a.ube += n * 2;
  }
  a.kcal += kcal;
}

// ───────────── Resumen de un día ─────────────

interface Ctx {
  plan: DaySum['plan'];
  mant: number;
  entreno: boolean;
  profile: Profile;
}

export function summarizeDay(entries: DiaryEntry[], ctx: Ctx): DaySum {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const t = entries.reduce((s, e) => ({ kcal: s.kcal + e.kcal, prot: s.prot + e.prot, hc: s.hc + e.hc, grasa: s.grasa + e.grasa }), { kcal: 0, prot: 0, hc: 0, grasa: 0 });
  const alc: Alcohol = { cerveza: 0, vino: 0, copas: 0, ube: 0, kcal: 0 };
  const ocas: string[] = [];
  const verdicts = new Map<string, string>();
  const verdictOf = (p: Product) => {
    const k = p.code ?? p.name;
    if (!verdicts.has(k)) verdicts.set(k, evaluate(p, ctx.profile).verdict);
    return verdicts.get(k);
  };
  const lookAt = (p: Product, grams: number, units: number | undefined, kcal: number) => {
    const kind = drinkKind(p.name, p.categories);
    if (kind) addDrink(alc, kind, grams, units ?? 1, kcal);
    else if (p.n.kcal != null && verdictOf(p) === 'ocasional') ocas.push(p.name);
  };
  for (const e of entries) {
    if (e.items?.length) {
      for (const i of e.items) {
        const g = itemGrams(i);
        lookAt(i.product, g, i.unit === 'unidad' ? i.qty : undefined, forGrams(i.product.n, g).kcal);
      }
    } else if (e.product && e.grams != null) {
      lookAt(e.product, e.grams, e.units, e.kcal);
    } else {
      // Apunte a mano: «2 cervezas», «Copa de vino»…
      const kind = drinkKind(e.name);
      if (kind) addDrink(alc, kind, null, +(e.name.match(/^\s*(\d+)/)?.[1] ?? 1), e.kcal);
    }
  }
  const s: DaySum = {
    kcal: Math.round(t.kcal), prot: r1(t.prot), hc: r1(t.hc), grasa: r1(t.grasa),
    plan: ctx.plan, mant: Math.round(ctx.mant), entreno: ctx.entreno,
    cena: entries.some((e) => e.name === 'Cena'),
  };
  if (alc.ube > 0) s.alc = { cerveza: Math.round(alc.cerveza), vino: Math.round(alc.vino), copas: r1(alc.copas), ube: r1(alc.ube), kcal: Math.round(alc.kcal) };
  if (ocas.length) s.ocas = ocas.slice(0, 12).map((n) => n.slice(0, 40));
  return s;
}

/** Plan del día: del perfil actual en la última semana; antes, el que se guardó entonces (cambia en cada cita). */
function dayContext(day: string, profile: Profile, prev: DaySum | undefined, now: Date, entreno?: boolean): Omit<Ctx, 'profile'> {
  const todayKey = dayKey(now);
  const ent = entreno ?? (day === todayKey ? todayOf(profile, now).entreno : prev ? prev.entreno : (profile.semana ?? []).some((t) => t.dow === dowOf(parseDay(day))));
  if (prev && daysBetween(day, todayKey) > 7) return { entreno: ent, plan: prev.plan, mant: prev.mant };
  const p = ent ? profile.entreno : profile.descanso;
  return { entreno: ent, plan: { kcal: p.kcal, prot: p.prot, hc: p.hc, grasa: p.grasa }, mant: (profile.gmtNeat ?? 0) + (ent ? profile.gastoEntreno ?? 0 : 0) };
}

// ───────────── Guardado ─────────────

export function loadSums(): Record<string, DaySum> {
  try {
    return JSON.parse(localStorage.getItem(RESUMEN) ?? '{}');
  } catch {
    return {};
  }
}

function saveSums(all: Record<string, DaySum>) {
  const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
  const s = JSON.stringify(sorted);
  try {
    // Solo si cambia algo: cada escritura programa una subida a la nube.
    if (s !== localStorage.getItem(RESUMEN)) localStorage.setItem(RESUMEN, s);
  } catch { /* almacenamiento lleno */ }
}

/** Actualiza el resumen de un día después de cambiar su diario. */
export function saveDaySummary(day: string, profile: Profile, entreno: boolean, now = new Date()): void {
  const all = loadSums();
  const entries = loadAllDays()[day] ?? [];
  if (!entries.length) delete all[day];
  else all[day] = summarizeDay(entries, { ...dayContext(day, profile, all[day], now, entreno), profile });
  saveSums(all);
}

/** Rehace los resúmenes de todos los días que siguen en el diario y devuelve todos los guardados. */
export function refreshSummaries(profile: Profile, now = new Date()): Record<string, DaySum> {
  const diary = loadAllDays();
  const all = loadSums();
  const days = Object.keys(diary).filter((d) => diary[d]?.length).sort();
  if (days.length) {
    // Días borrados del diario (los anteriores al primero guardado ya no están por el recorte de 120 días).
    for (const k of Object.keys(all)) if (k >= days[0] && !diary[k]?.length) delete all[k];
  }
  for (const d of days) all[d] = summarizeDay(diary[d], { ...dayContext(d, profile, all[d], now), profile });
  saveSums(all);
  return all;
}

// ───────────── Notas ─────────────

export type Tone = 'verde' | 'amarillo' | 'rojo';
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

export function dayScore(s: DaySum): number {
  const { kcal, plan, mant } = s;
  if (plan.kcal <= 0) return 0;
  const r = kcal / plan.kcal;
  const { level, redFrom } = kcalLevel(kcal, plan.kcal, mant);
  if (level === 'ok') return r >= 0.9 ? 10 : clamp(10 - (0.9 - r) * 25, 0, 10);
  const okTop = plan.kcal * 1.02;
  if (level === 'alto') return 7.9 - 2.9 * clamp((kcal - okTop) / Math.max(1, redFrom - okTop), 0, 1);
  return clamp(4.9 - (4.9 * (kcal - redFrom)) / Math.max(100, redFrom - plan.kcal), 0, 4.9);
}

export const toneOf = (score: number): Tone => (score >= 8 ? 'verde' : score >= 5 ? 'amarillo' : 'rojo');
export const TONE_TEXT: Record<Tone, string> = { verde: 'Cumplido', amarillo: 'Mejorable', rojo: 'No cumplido' };

export interface DayRow {
  day: string;
  sum?: DaySum;
  score: number | null;
  /** 'curso': hoy, aún sin la cena apuntada; no cuenta para la nota. */
  status: 'ok' | 'curso' | 'vacio' | 'futuro' | 'antes';
}

export interface Stats {
  rows: DayRow[];
  counted: DayRow[];
  score: number | null;
  /** Días del periodo que ya han pasado (o hoy), para medias semanales. */
  span: number;
  avg: { kcal: number; prot: number; hc: number; grasa: number; plan: DaySum['plan'] } | null;
  alc: Alcohol;
  ocas: string[];
}

export function periodStats(days: string[], sums: Record<string, DaySum>, todayKey = dayKey()): Stats {
  // Los días anteriores al primero apuntado en la app no cuentan como «sin apuntar».
  const first = Object.keys(sums).sort()[0] ?? todayKey;
  const rows: DayRow[] = days.map((day) => {
    const sum = sums[day];
    if (day > todayKey) return { day, score: null, status: 'futuro' };
    if (day < first) return { day, score: null, status: 'antes' };
    if (!sum || sum.kcal <= 0) return { day, score: null, status: 'vacio', sum };
    if (day === todayKey && !sum.cena) return { day, sum, score: dayScore(sum), status: 'curso' };
    return { day, sum, score: dayScore(sum), status: 'ok' };
  });
  const counted = rows.filter((r) => r.status === 'ok');
  const n = counted.length;
  const mean = (f: (s: DaySum) => number) => counted.reduce((a, r) => a + f(r.sum!), 0) / n;
  const alc: Alcohol = { cerveza: 0, vino: 0, copas: 0, ube: 0, kcal: 0 };
  const ocas: string[] = [];
  for (const r of rows) {
    if (!r.sum) continue;
    if (r.sum.alc) for (const k of Object.keys(alc) as (keyof Alcohol)[]) alc[k] += r.sum.alc[k];
    if (r.sum.ocas) ocas.push(...r.sum.ocas);
  }
  return {
    rows,
    counted,
    score: n ? mean(dayScore) : null,
    span: rows.filter((r) => r.status !== 'futuro' && r.status !== 'antes').length,
    avg: n ? {
      kcal: mean((s) => s.kcal), prot: mean((s) => s.prot), hc: mean((s) => s.hc), grasa: mean((s) => s.grasa),
      plan: { kcal: mean((s) => s.plan.kcal), prot: mean((s) => s.plan.prot), hc: mean((s) => s.plan.hc), grasa: mean((s) => s.plan.grasa) },
    } : null,
    alc,
    ocas,
  };
}

/** UBE de una cerveza de 330 ml al 5 %. */
const UBE_TERCIO = (330 * 0.05 * 0.8) / 10;

/**
 * Máximo de alcohol a la semana, en cervezas de 330 ml (≈ 140 kcal). Manda lo más bajo entre:
 * - calorías: un 5 % de las kcal de la semana en déficit o recomposición (7 % en mantenimiento o volumen);
 * - salud: 10 g de alcohol al día de media (70 g a la semana), el límite de bajo riesgo del Ministerio de
 *   Sanidad para mujeres (20 g en hombres). El perfil no tiene sexo, así que se usa el más prudente.
 */
export function alcoholLimit(planKcalDay: number, objetivo: Profile['objetivo']): number {
  const share = objetivo === 'deficit' || objetivo === 'recomposicion' ? 0.05 : 0.07;
  const byKcal = (planKcalDay * 7 * share) / 140;
  const byHealth = 7 / UBE_TERCIO;
  return Math.max(0, Math.floor(Math.min(byKcal, byHealth)));
}

const n0 = (x: number) => Math.round(x).toLocaleString('es-ES');
const DOW = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

/** Cosas a mejorar, de la más importante a la menos (como mucho tres). */
export function tips(st: Stats, objetivo: Profile['objetivo'], kind: 'semana' | 'mes' | 'año'): string[] {
  const out: string[] = [];
  const weeks = Math.max(1, st.span / 7);
  const perWeek = kind === 'semana' ? '' : ' de media a la semana';
  const { counted, avg } = st;

  // 1. Días en rojo
  const red = counted.filter((r) => toneOf(r.score!) === 'rojo');
  if (red.length) {
    const extra = red.reduce((a, r) => a + r.sum!.kcal - r.sum!.plan.kcal, 0) / red.length;
    const weekend = red.every((r) => dowOf(parseDay(r.day)) >= 4);
    const which = kind === 'semana' ? ` (${red.map((r) => DOW[dowOf(parseDay(r.day))]).join(', ')})` : '';
    out.push(`${red.length} ${red.length === 1 ? 'día' : 'días'} muy por encima del plan${which}: unas ${n0(extra)} kcal de más cada uno.${weekend && red.length > 1 ? ' Todos en fin de semana: deja margen para esos días.' : ''}`);
  }

  // 2. Alcohol
  if (avg && st.alc.ube > 0) {
    const limit = alcoholLimit(avg.plan.kcal, objetivo);
    const eq = st.alc.ube / UBE_TERCIO / weeks;
    if (eq > limit + 0.4) {
      const count = (x: number, one: string, many: string) => {
        const r = Math.round(x);
        return r >= 1 ? `${r} ${r === 1 ? one : many}` : null;
      };
      const parts = [
        count(st.alc.cerveza / 330 / weeks, 'cerveza', 'cervezas'),
        count(st.alc.vino / 150 / weeks, 'copa de vino', 'copas de vino'),
        count(st.alc.copas / weeks, 'combinado', 'combinados'),
      ].filter(Boolean).join(', ') || 'algo de alcohol';
      out.push(`Alcohol: ${parts}${perWeek} (≈ ${n0(st.alc.kcal / weeks)} kcal). Con tu objetivo, mejor no pasar de ${limit === 0 ? 'ninguna cerveza' : `${limit} ${limit === 1 ? 'cerveza' : 'cervezas'} de 330 ml`} (o equivalente) a la semana.`);
    }
  }

  // 3. Productos de consumo ocasional
  const oc = st.ocas.length / weeks;
  if (oc > 3) {
    const freq = new Map<string, number>();
    for (const n of st.ocas) freq.set(n, (freq.get(n) ?? 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n.toLowerCase());
    out.push(`${n0(oc)} tomas de productos de consumo ocasional${perWeek} (${top.join(', ')}). Déjalo en 2 o 3 a la semana.`);
  }

  if (avg) {
    // 4. Macros (medias de los días completos)
    if (avg.prot < avg.plan.prot * 0.85) out.push(`Proteína: te quedas en ${n0(avg.prot)} g al día de media; tu plan marca ${n0(avg.plan.prot)} g.`);
    if (avg.grasa > avg.plan.grasa * 1.15) out.push(`Grasa: ${n0(avg.grasa)} g al día de media frente a ${n0(avg.plan.grasa)} g del plan.`);
    if (avg.hc > avg.plan.hc * 1.15) out.push(`Hidratos: ${n0(avg.hc)} g al día de media frente a ${n0(avg.plan.hc)} g del plan.`);
  }

  // 5. Días con muy poco apuntado
  const low = counted.filter((r) => r.sum!.kcal < r.sum!.plan.kcal * 0.7);
  if (low.length) out.push(`${low.length} ${low.length === 1 ? 'día' : 'días'} por debajo del 70 % de tus calorías. Si no apuntaste todo, la nota baja sin motivo; si comiste tan poco, reparte mejor las comidas.`);

  // 6. Pocos días para fiarse de la nota
  if (counted.length && (kind === 'semana' ? counted.length < Math.min(4, st.span) : counted.length < st.span * 0.6)) out.push(`Solo hay ${counted.length} ${counted.length === 1 ? 'día completo apuntado' : 'días completos apuntados'}: la nota es orientativa.`);

  if (!out.length && counted.length) out.push('Nada que corregir: las calorías y los macros han ido según el plan.');
  return out.slice(0, 3);
}
