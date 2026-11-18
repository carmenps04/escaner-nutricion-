// Lee los valores de una tabla nutricional a partir del texto que devuelve el OCR.
// Se toma el primer número tras cada palabra clave, que en las etiquetas españolas es la columna
// «por 100 g». Siempre se enseña el resultado para que se pueda corregir.

import type { Nutrients } from './types.ts';

export interface LabelResult {
  n: Nutrients;
  liquid: boolean;
  found: number;
  /** true si las kcal se han calculado a partir de los macros porque no se leían bien. */
  kcalEstimated: boolean;
}

/** Minúsculas, sin tildes y con los errores de OCR más comunes corregidos. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // «O» o «o» pegadas a cifras suelen ser ceros: «O,9» → «0,9», «1O» → «10»
    .replace(/(?<=\d)[o](?=[\d,.\s]|g\b)/g, '0')
    .replace(/(?<![a-z])o(?=[,.]\d)/g, '0')
    .replace(/\s+/g, ' ');
}

const NUM = String.raw`(\d{1,4}(?:[.,]\d{1,2})?)`;

function num(s: string): number {
  return parseFloat(s.replace(',', '.'));
}

/**
 * El OCR suele leer la «g» pegada al número como un 9: «2,5 g» → «2,59», «63 g» → «639».
 * Si al número no le sigue ninguna unidad y acaba en 9, se quita ese 9.
 */
function fixTrailingG(token: string, unit: string | undefined): number {
  if (!unit && token.length > 1 && token.endsWith('9')) {
    const t = token.slice(0, -1).replace(/[.,]$/, '');
    if (t) return num(t);
  }
  return num(token);
}

/** Primer número que aparece tras la palabra clave, a menos de `gap` caracteres sin cifras. */
function after(t: string, key: RegExp, gap = 30): number | null {
  const re = new RegExp(key.source + String.raw`[^\d]{0,${gap}}?` + NUM + String.raw`(\s?(?:mg|g)\b)?`);
  const m = re.exec(t);
  return m ? fixTrailingG(m[m.length - 2], m[m.length - 1]) : null;
}

export function parseLabel(raw: string): LabelResult {
  const t = normalize(raw);
  const n: Nutrients = { kcal: null, prot: null, hc: null, azucar: null, grasa: null, sat: null, fibra: null, sal: null };

  // Energía: «1960 kJ / 468 kcal». El OCR a veces separa «kcal» o pierde los kJ, así que se toma el
  // primer candidato del texto (columna de 100 g): el número tras «kJ /» o el que va antes de «kcal».
  const cands: { i: number; v: number }[] = [];
  // La barra de «kJ / kcal» a veces se lee como 7, l o 1: «kJ 7 468».
  for (const m of t.matchAll(new RegExp(String.raw`kj\s*(?:[/|]\s*|[7l1i]\s+)` + NUM, 'g'))) cands.push({ i: m.index!, v: num(m[1]) });
  for (const m of t.matchAll(new RegExp(NUM + String.raw`\s*k\s?cal`, 'g'))) cands.push({ i: m.index!, v: num(m[1]) });
  const best = cands.filter((c) => c.v <= 900).sort((a, b) => a.i - b.i)[0];
  if (best) n.kcal = best.v;
  else {
    const kj = t.match(new RegExp(NUM + String.raw`\s*kj`));
    if (kj) n.kcal = Math.round(num(kj[1]) / 4.184);
  }

  // «grasas» que no sea «grasas saturadas» / «ácidos grasos saturados»
  n.grasa = after(t, /(?<!acidos )grasas?(?! ?saturad)(?: totales)?/);
  n.sat = after(t, /saturad[oa]s/);
  n.hc = after(t, /(?:hidratos de carbono|carbohidratos|hidratos)/);
  n.azucar = after(t, /azucares/);
  n.fibra = after(t, /fibra(?: alimentaria| dietetica)?/);
  n.prot = after(t, /proteinas?/);
  n.sal = after(t, /(?<![a-z])sal(?![a-z])/, 15);

  // Sanidad: por 100 g nada pasa de 100 g y las partes no superan al total.
  for (const k of ['prot', 'hc', 'azucar', 'grasa', 'sat', 'fibra', 'sal'] as const) {
    if (n[k] != null && n[k]! > 100) n[k] = null;
  }
  if (n.kcal != null && n.kcal > 900) n.kcal = null;
  // Una parte mayor que su total suele ser una coma perdida («2,1» leído «21»).
  if (n.sat != null && n.grasa != null && n.sat > n.grasa) n.sat = n.sat / 10 <= n.grasa ? n.sat / 10 : null;
  if (n.azucar != null && n.hc != null && n.azucar > n.hc) n.azucar = n.azucar / 10 <= n.hc ? n.azucar / 10 : null;

  // Las kcal deben cuadrar con los macros (4 kcal/g proteína e hidratos, 9 grasa, 2 fibra).
  let kcalEstimated = false;
  if (n.prot != null && n.hc != null && n.grasa != null) {
    const est = n.prot * 4 + n.hc * 4 + n.grasa * 9 + (n.fibra ?? 0) * 2;
    const ok = (v: number) => est > 20 && Math.abs(v - est) / est <= 0.2;
    if (n.kcal == null || (est > 20 && !ok(n.kcal))) {
      const alt = cands.find((c) => ok(c.v));
      if (alt) n.kcal = alt.v;
      else if (est > 0) { n.kcal = Math.round(est); kcalEstimated = true; }
    }
  }

  const liquid = /100\s?ml/.test(t) && !/100\s?g\b/.test(t);
  const found = Object.values(n).filter((v) => v != null).length;
  return { n, liquid, found, kcalEstimated };
}
