// Valoración de un producto según el perfil y el plan del dietista.
//
// Idea general:
// 1. Se puntúa la calidad del producto (0–100) con siete criterios. El peso de cada criterio depende
//    del objetivo (en déficit pesan más la proteína y la densidad calórica).
// 2. La puntuación da el veredicto: buena opción, regular u ocasional.
// 3. La cantidad máxima por toma sale de varios topes (calorías, grasa, hidratos, azúcar, sal y
//    grasa saturada) calculados sobre el plan de cada tipo de día. Manda el tope más bajo.
//
// Los umbrales de azúcar, grasa saturada y sal son los del semáforo nutricional británico (FSA),
// los de fibra los de las declaraciones de la UE («fuente de fibra» 3 g, «alto en fibra» 6 g) y los
// límites diarios de azúcar libre y sal los de la OMS (10 % de las kcal y 5 g). El reparto por toma y
// los pesos de cada criterio son criterio propio de la app: orientativos, no los fija el dietista.

import type { Product, Nutrients } from './types.ts';
import type { Profile, DayPlan, Objetivo } from './profile.ts';

export type Verdict = 'buena' | 'regular' | 'ocasional';

export const VERDICT_TEXT: Record<Verdict, string> = {
  buena: 'Buena opción',
  regular: 'Regular',
  ocasional: 'Ocasional',
};

export interface Reason {
  tone: 'pos' | 'neg' | 'neutral';
  text: string;
}

export interface Portion {
  /** Gramos (o ml) máximos por toma; null = sin límite práctico. */
  grams: number | null;
  units: number | null;
  /** Qué tope manda. */
  limitedBy: string;
  kcal: number | null;
  /** % de las kcal del día que supone esa cantidad. */
  pctDayKcal: number | null;
  prot: number | null;
  hc: number | null;
  grasa: number | null;
}

export interface Evaluation {
  score: number;
  verdict: Verdict;
  reasons: Reason[];
  frequency: string;
  timing: string | null;
  /** Tipo de producto para el consejo de momento del día: hidratos con poca grasa, o sobre todo grasa. */
  macroKind: 'hc' | 'grasa' | null;
  descanso: Portion;
  entreno: Portion;
  warnings: string[];
  kind: 'general' | 'grasa' | 'sin-calorias';
  /** Nota y peso de cada criterio, para enseñar cómo se ha calculado. */
  breakdown: { label: string; score: number; weight: number }[];
}

const CRITERION_LABEL: Record<Criterion, string> = {
  prot: 'Proteína frente a tu plan',
  densidad: 'Densidad calórica',
  azucar: 'Azúcar libre',
  nova: 'Grado de procesado',
  fibra: 'Fibra',
  sat: 'Grasa saturada',
  sal: 'Sal',
};

const WEIGHTS: Record<Objetivo, Record<Criterion, number>> = {
  // Déficit: proteína (conservar músculo) y densidad calórica (saciedad) primero; el ultraprocesado
  // pesa más porque en ensayos controlados hace comer más sin darse cuenta.
  deficit: { prot: 0.25, azucar: 0.14, sat: 0.08, sal: 0.05, fibra: 0.1, densidad: 0.23, nova: 0.15 },
  mantenimiento: { prot: 0.2, azucar: 0.17, sat: 0.13, sal: 0.1, fibra: 0.12, densidad: 0.13, nova: 0.15 },
  volumen: { prot: 0.3, azucar: 0.13, sat: 0.12, sal: 0.08, fibra: 0.1, densidad: 0.07, nova: 0.2 },
  recomposicion: { prot: 0.3, azucar: 0.14, sat: 0.08, sal: 0.05, fibra: 0.1, densidad: 0.18, nova: 0.15 },
};

type Criterion = 'prot' | 'azucar' | 'sat' | 'sal' | 'fibra' | 'densidad' | 'nova';

const clamp = (x: number, a = 0, b = 100) => Math.min(b, Math.max(a, x));
/** Interpolación lineal de y entre (x0,y0) y (x1,y1). */
const lerp = (x: number, x0: number, y0: number, x1: number, y1: number) =>
  y0 + ((clamp(x, Math.min(x0, x1), Math.max(x0, x1)) - x0) * (y1 - y0)) / (x1 - x0);

/** Zumos, néctares y batidos: su azúcar sí cuenta como azúcar libre (OMS), aunque sean «naturales». */
const isJuice = (p: Product) => (p.categories ?? []).some((c) => /juice|nectar|smoothie/.test(c)) || /zumo|jugo|n[ée]ctar|smoothie|batido/i.test(p.name);

/**
 * Azúcar natural de alimentos sin procesar (fruta entera, leche, yogur natural): la OMS no lo cuenta
 * como azúcar libre, así que no se penaliza ni limita la cantidad.
 */
export const naturalSugar = (p: Product) => p.nova === 1 && !isJuice(p);

/** Bebida a efectos de valoración (productos antiguos sin el dato: lo que diga la unidad). */
export const isDrinkP = (p: Product) => p.drink ?? p.liquid;

export const fmt = (x: number, d = 1) =>
  x.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Gramos de proteína por cada 100 kcal que pide el plan. */
export function targetProteinDensity(plan: DayPlan): number {
  return (plan.prot * 100) / plan.kcal;
}

function scores(n: Nutrients, p: Product, plan: DayPlan): Partial<Record<Criterion, number>> {
  const s: Partial<Record<Criterion, number>> = {};
  // Criterios de bebida solo para bebidas; un gazpacho en ml se valora como comida.
  const liquid = isDrinkP(p);

  if (n.prot != null && n.kcal != null && n.kcal >= 10) {
    const pd = (n.prot * 100) / n.kcal;
    s.prot = clamp((pd / targetProteinDensity(plan)) * 70);
  }
  // Azúcar natural (fruta entera, leche…): cuenta como cero azúcar libre.
  if (n.azucar != null && naturalSugar(p)) s.azucar = 100;
  else if (n.azucar != null) {
    s.azucar = liquid
      ? n.azucar <= 2.5 ? 100 : n.azucar <= 11.25 ? lerp(n.azucar, 2.5, 100, 11.25, 20) : lerp(n.azucar, 11.25, 20, 20, 0)
      : n.azucar <= 5 ? 100 : n.azucar <= 22.5 ? lerp(n.azucar, 5, 100, 22.5, 30) : lerp(n.azucar, 22.5, 30, 45, 0);
  }
  if (n.sat != null) {
    s.sat = liquid
      ? n.sat <= 0.75 ? 100 : n.sat <= 2.5 ? lerp(n.sat, 0.75, 100, 2.5, 30) : lerp(n.sat, 2.5, 30, 5, 0)
      : n.sat <= 1.5 ? 100 : n.sat <= 5 ? lerp(n.sat, 1.5, 100, 5, 30) : lerp(n.sat, 5, 30, 10, 0);
  }
  if (n.sal != null) {
    const [lo, hi] = liquid ? [0.3, 0.75] : [0.3, 1.5];
    s.sal = n.sal <= lo ? 100 : n.sal <= hi ? lerp(n.sal, lo, 100, hi, 30) : lerp(n.sal, hi, 30, hi * 2, 0);
  }
  // La fibra solo penaliza en productos ricos en hidratos (pan, cereales, galletas…): a la carne o
  // al yogur no se les pide fibra. Si hay mucha, siempre suma.
  if (n.fibra != null && !liquid) {
    if (n.fibra >= 3) s.fibra = n.fibra >= 6 ? 100 : lerp(n.fibra, 3, 70, 6, 100);
    else if ((n.hc ?? 0) >= 30) s.fibra = lerp(n.fibra, 0, 20, 3, 70);
  }
  if (n.kcal != null) {
    if (liquid) s.densidad = n.kcal <= 20 ? 100 : n.kcal <= 50 ? lerp(n.kcal, 20, 100, 50, 40) : lerp(n.kcal, 50, 40, 100, 10);
    else s.densidad = n.kcal <= 100 ? 100 : n.kcal <= 250 ? lerp(n.kcal, 100, 100, 250, 70) : n.kcal <= 400 ? lerp(n.kcal, 250, 70, 400, 35) : lerp(n.kcal, 400, 35, 600, 10);
  }
  if (p.nova) s.nova = p.nova <= 2 ? 100 : p.nova === 3 ? 70 : 35;
  return s;
}

function weightedScore(s: Partial<Record<Criterion, number>>, obj: Objetivo): number | null {
  const w = WEIGHTS[obj];
  let sum = 0;
  let tw = 0;
  for (const k of Object.keys(s) as Criterion[]) {
    sum += (s[k] as number) * w[k];
    tw += w[k];
  }
  return tw > 0.3 ? sum / tw : null;
}

function verdictOf(score: number): Verdict {
  return score >= 65 ? 'buena' : score >= 40 ? 'regular' : 'ocasional';
}

const KCAL_SHARE: Record<Verdict, number> = { buena: 0.22, regular: 0.12, ocasional: 0.07 };

/** Cantidad máxima por toma para un tipo de día. */
export function portion(p: Product, plan: DayPlan, verdict: Verdict, kind: Evaluation['kind']): Portion {
  const n = p.n;
  const caps: { g: number; why: string }[] = [];
  const per = (v: number | null, limit: number, why: string) => {
    if (v != null && v > 0) caps.push({ g: (limit / v) * 100, why });
  };
  if (kind === 'grasa') {
    per(n.grasa, 10, 'la grasa: unos 10 g de aceite o grasa por comida');
  } else {
    per(n.kcal, plan.kcal * KCAL_SHARE[verdict], `las calorías: hasta un ${Math.round(KCAL_SHARE[verdict] * 100)} % de las del día para un producto ${VERDICT_TEXT[verdict].toLowerCase()}`);
    per(n.grasa, plan.grasa * 0.35, 'la grasa: un 35 % de la grasa del día por toma');
    per(n.prot, plan.prot * 0.4, 'la proteína: un 40 % de la del día por toma, para repartirla entre las comidas');
    per(n.hc, plan.hc * 0.35, 'los hidratos: un 35 % de los hidratos del día por toma');
    // Con poco azúcar (lactosa del yogur, la fruta…) este tope no se aplica.
    if (!naturalSugar(p) && (n.azucar ?? 0) > (isDrinkP(p) ? 2.5 : 5)) per(n.azucar, ((plan.kcal * 0.1) / 4) * 0.4, 'el azúcar: el 40 % del máximo diario de azúcar (OMS)');
    per(n.sat, ((plan.kcal * 0.1) / 9) * 0.4, 'la grasa saturada: el 40 % del máximo diario');
  }
  per(n.sal, 1.5, 'la sal: 1,5 g por toma (máximo 5 g al día, OMS)');

  if (!caps.length) {
    return { grams: null, units: null, limitedBy: 'faltan datos', kcal: null, pctDayKcal: null, prot: null, hc: null, grasa: null };
  }
  const best = caps.reduce((a, b) => (b.g < a.g ? b : a));
  // «Sin límite» solo para comida de pocas calorías (≤ 60 kcal por 100 g, como verdura o fruta)
  // cuando el tope pasa de 600 g: decir «11 zanahorias» no ayuda. En bebidas se da siempre la cifra
  // (p. ej. leche desnatada: hasta 950 ml).
  if (best.g > 600 && (n.kcal ?? 0) <= 60 && !isDrinkP(p)) {
    return { grams: null, units: null, limitedBy: 'alimento poco calórico: no hay un límite práctico por toma', kcal: null, pctDayKcal: null, prot: null, hc: null, grasa: null };
  }
  let grams = best.g;
  let units: number | null = null;
  if (p.unitWeight && p.unitWeight > 0) {
    units = Math.floor(grams / p.unitWeight + 0.05);
    if (units >= 1) grams = units * p.unitWeight;
    else units = 0;
  } else {
    grams = grams >= 200 ? Math.floor(grams / 50) * 50 : grams >= 20 ? Math.floor(grams / 5) * 5 : Math.floor(grams);
  }
  const f = grams / 100;
  const kcal = n.kcal != null ? n.kcal * f : null;
  return {
    grams,
    units,
    limitedBy: best.why,
    kcal,
    pctDayKcal: kcal != null ? (kcal / plan.kcal) * 100 : null,
    prot: n.prot != null ? n.prot * f : null,
    hc: n.hc != null ? n.hc * f : null,
    grasa: n.grasa != null ? n.grasa * f : null,
  };
}

export function evaluate(p: Product, profile: Profile): Evaluation {
  const n = p.n;
  const warnings: string[] = [];
  const reasons: Reason[] = [];
  const plan = profile.descanso; // se puntúa con el día más restrictivo
  const u = p.liquid ? 'ml' : 'g';

  if (n.kcal == null) warnings.push('Falta el valor energético: la valoración es incompleta.');
  const missing = (['prot', 'hc', 'azucar', 'grasa', 'sat', 'sal'] as const).filter((k) => n[k] == null);
  if (missing.length) warnings.push(`Faltan datos de: ${missing.map(labelOf).join(', ')}.`);
  if (n.kcal != null && n.prot != null && n.hc != null && n.grasa != null && n.kcal > 30) {
    const calc = n.prot * 4 + n.hc * 4 + n.grasa * 9 + (n.fibra ?? 0) * 2;
    if (Math.abs(calc - n.kcal) / n.kcal > 0.25) warnings.push('Las calorías no cuadran con los macronutrientes: revisa los valores (puede haber un error de lectura).');
  }

  // Casos especiales
  let kind: Evaluation['kind'] = 'general';
  if (n.kcal != null && n.kcal < (isDrinkP(p) ? 5 : 15) && (n.azucar ?? 0) < 1) kind = 'sin-calorias';
  else if ((n.grasa ?? 0) >= 80) kind = 'grasa';

  let score: number;
  let breakdown: Evaluation['breakdown'] = [];
  if (kind === 'sin-calorias') {
    score = 80;
    reasons.push({ tone: 'pos', text: `Casi no aporta calorías (${fmt(n.kcal ?? 0)} kcal por 100 ${u}).` });
    if (isDrinkP(p)) reasons.push({ tone: 'neutral', text: 'Si lleva edulcorantes, la app no los valora: no restan en tu plan, pero conviene que el agua siga siendo la bebida principal.' });
  } else if (kind === 'grasa') {
    const olive = (p.categories ?? []).some((c) => c.includes('olive-oil')) || /oliva/i.test(p.name);
    score = olive ? 72 : (n.sat ?? 100) > 30 ? 30 : 50;
    reasons.push({ tone: olive ? 'pos' : 'neutral', text: olive ? 'Aceite de oliva: es la grasa de referencia en tu dieta, pero es casi todo grasa (unas 90 kcal por cucharada).' : 'Producto que es casi todo grasa: cuenta como grasa del día.' });
    if ((n.sat ?? 0) > 30) reasons.push({ tone: 'neg', text: `Mucha grasa saturada (${fmt(n.sat!)} g por 100 g).` });
  } else {
    const s = scores(n, p, plan);
    const ws = weightedScore(s, profile.objetivo);
    const w = WEIGHTS[profile.objetivo];
    const tw = (Object.keys(s) as Criterion[]).reduce((a, k) => a + w[k], 0);
    breakdown = (Object.keys(s) as Criterion[])
      .map((k) => ({ label: CRITERION_LABEL[k], score: Math.round(s[k]!), weight: Math.round((w[k] / tw) * 100) }))
      .sort((a, b) => b.weight - a.weight);
    if (ws == null) {
      score = 50;
      warnings.push('Hay muy pocos datos para valorar el producto.');
    } else score = ws;
    reasons.push(...describe(n, p, plan, s));
    // Bebidas azucaradas y productos que son sobre todo azúcar: como mucho «ocasional».
    if (isDrinkP(p) && (n.azucar ?? 0) > 5) {
      score = Math.min(score, 30);
      reasons.unshift({ tone: 'neg', text: 'Bebida azucarada: calorías líquidas que no sacian.' });
    } else if (!isDrinkP(p) && n.kcal && n.azucar != null && n.azucar >= 12.5 && (n.azucar * 4) / n.kcal >= 0.5 && p.nova !== 1) {
      // Solo con azúcar abundante: en verduras como el tomate casi todas las kcal son azúcar natural, pero son muy pocas.
      score = Math.min(score, 35);
      reasons.unshift({ tone: 'neg', text: 'Más de la mitad de sus calorías vienen del azúcar.' });
    }
    // Un alimento sin procesar (NOVA 1) no se marca como «ocasional»: el límite lo pone la cantidad.
    if (p.nova === 1 && score < 40) score = 40;
  }

  const verdict = verdictOf(score);
  const descanso = portion(p, profile.descanso, verdict, kind);
  const entreno = portion(p, profile.entreno, verdict, kind);

  // Momento del día: productos de hidratos con poca grasa encajan mejor alrededor del entreno.
  let timing: string | null = null;
  let macroKind: Evaluation['macroKind'] = null;
  if (n.kcal && n.hc != null && n.grasa != null && kind === 'general') {
    const hcShare = (n.hc * 4) / n.kcal;
    const fatShare = (n.grasa * 9) / n.kcal;
    if (hcShare >= 0.55 && fatShare <= 0.3) { macroKind = 'hc'; timing = 'Son sobre todo hidratos: encaja mejor en días de entreno, antes o después de entrenar.'; }
    else if (fatShare >= 0.5) { macroKind = 'grasa'; timing = 'Es sobre todo grasa: mejor lejos del entreno y sin juntarlo con otras grasas en la misma comida.'; }
  }

  return { score: Math.round(score), verdict, reasons, frequency: frequency(verdict, score, macroKind === 'hc', kind), timing, macroKind, descanso, entreno, warnings, kind, breakdown };
}

function frequency(v: Verdict, score: number, carbHeavy: boolean, kind: Evaluation['kind']): string {
  if (kind === 'grasa') return 'A diario, medido con cuchara y dentro de la grasa de tu plan.';
  if (kind === 'sin-calorias') return 'Cualquier día.';
  if (v === 'buena') return 'Cualquier día, entrenes o no.';
  if (v === 'regular') return carbHeavy
    ? 'Cada 2–3 días, preferiblemente en días de entreno. No todos los días.'
    : 'Cada 3–4 días, sin repetir dos días seguidos.';
  return score < 25 ? 'Como capricho puntual: una vez cada una o dos semanas.' : 'Una vez por semana como máximo.';
}

function labelOf(k: keyof Nutrients): string {
  return { kcal: 'energía', prot: 'proteína', hc: 'hidratos', azucar: 'azúcares', grasa: 'grasa', sat: 'saturadas', fibra: 'fibra', sal: 'sal' }[k];
}

function describe(n: Nutrients, p: Product, plan: DayPlan, s: Partial<Record<Criterion, number>>): Reason[] {
  const r: Reason[] = [];
  const u = p.liquid ? 'ml' : 'g';
  const tone = (x: number | undefined, good = 75, bad = 45): Reason['tone'] => (x == null ? 'neutral' : x >= good ? 'pos' : x < bad ? 'neg' : 'neutral');

  if (s.prot != null) {
    const pd = (n.prot! * 100) / n.kcal!;
    r.push({ tone: tone(s.prot, 60, 35), text: `Proteína: ${fmt(pd)} g por cada 100 kcal. Tu plan pide de media unos ${fmt(targetProteinDensity(plan))} g, así que ${pd >= targetProteinDensity(plan) ? 'ayuda a llegar a tu proteína' : pd >= targetProteinDensity(plan) * 0.5 ? 'aporta algo, pero menos de lo que necesitas' : 'apenas ayuda a llegar a tu proteína'}.` });
  }
  if (s.densidad != null) {
    r.push({ tone: tone(s.densidad, 70, 40), text: `Densidad calórica: ${fmt(n.kcal!, 0)} kcal por 100 ${u}${isDrinkP(p) ? (n.kcal! > 40 ? ' (las calorías bebidas sacian poco)' : '') : n.kcal! > 400 ? ' (muchas calorías en poco volumen, cuesta controlar la cantidad)' : n.kcal! <= 150 ? ' (sacia con pocas calorías)' : ''}.` });
  }
  if (s.azucar != null && (s.azucar < 75 || n.azucar! <= (isDrinkP(p) ? 2.5 : 5))) {
    r.push({ tone: tone(s.azucar), text: n.azucar! <= (isDrinkP(p) ? 2.5 : 5) ? `Poco azúcar (${fmt(n.azucar!)} g por 100 ${u}).` : `Azúcar ${s.azucar < 45 ? 'alto' : 'moderado'}: ${fmt(n.azucar!)} g por 100 ${u}.` });
  }
  if (s.fibra != null) r.push({ tone: tone(s.fibra, 70, 45), text: n.fibra! >= 3 ? `Buena fibra (${fmt(n.fibra!)} g por 100 g).` : `Poca fibra para ser un producto de hidratos (${fmt(n.fibra!)} g por 100 g).` });
  if (s.sat != null && s.sat < 75) r.push({ tone: tone(s.sat), text: `Grasa saturada ${s.sat < 45 ? 'alta' : 'moderada'}: ${fmt(n.sat!)} g por 100 ${u}.` });
  if (s.sal != null && s.sal < 75) r.push({ tone: tone(s.sal), text: `Sal ${s.sal < 45 ? 'alta' : 'moderada'}: ${fmt(n.sal!, 2)} g por 100 ${u}.` });
  if (p.nova) r.push({ tone: p.nova >= 4 ? 'neg' : p.nova <= 2 ? 'pos' : 'neutral', text: ['', 'Alimento sin procesar o mínimamente procesado (NOVA 1).', 'Ingrediente culinario (NOVA 2).', 'Alimento procesado (NOVA 3).', 'Ultraprocesado (NOVA 4).'][p.nova] });

  // Primero lo negativo y lo positivo; lo neutro al final.
  const order = { neg: 0, pos: 1, neutral: 2 } as const;
  return r.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** «5 galletas (70 g)». */
export function portionText(p: Portion, prod: Product): string {
  if (p.grams == null) return p.limitedBy.startsWith('alimento') ? 'Sin límite práctico' : '—';
  const u = prod.liquid ? 'ml' : 'g';
  if (p.units != null && prod.unitWeight) {
    if (p.units === 0) return `Menos de 1 ${prod.unitName ?? 'unidad'} (${fmt(p.grams, 0)} ${u})`;
    const name = prod.unitName ?? 'unidad';
    return `${p.units} ${p.units === 1 ? name : plural(name)} (${fmt(p.grams, 0)} ${u})`;
  }
  return `${fmt(p.grams, 0)} ${u}`;
}

export function plural(w: string): string {
  // «patata mediana» → «patatas medianas»
  if (w.includes(' ')) return w.split(' ').map(pluralWord).join(' ');
  return pluralWord(w);
}

function pluralWord(w: string): string {
  if (/[aeiouáéó]$/i.test(w)) return w + 's';
  if (/z$/i.test(w)) return w.slice(0, -1) + 'ces';
  if (/ón$/i.test(w)) return w.slice(0, -2) + 'ones';
  return w + 'es';
}
