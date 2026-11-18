// Lee la hoja de «Planificación nutricional y deportivo» del dietista a partir del texto del OCR.
// Devuelve solo lo que encuentra; el formulario del perfil enseña el resto para completarlo.

import { racionesToGrams, type Profile, type DayPlan } from './profile.ts';
import { normalize } from './parseLabel.ts';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const n = (s: string) => parseFloat(s.replace(',', '.'));

export interface SheetResult {
  data: Partial<Omit<Profile, 'descanso' | 'entreno'>> & { descanso?: Partial<DayPlan>; entreno?: Partial<DayPlan> };
  found: string[];
}

export function parseDietSheet(raw: string): SheetResult {
  const t = normalize(raw);
  const d: SheetResult['data'] = {};
  const found: string[] = [];

  const fecha = t.match(/(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (fecha && MESES.includes(fecha[2])) {
    d.fecha = `${fecha[3]}-${String(MESES.indexOf(fecha[2]) + 1).padStart(2, '0')}-${fecha[1].padStart(2, '0')}`;
    found.push('fecha');
  }

  const peso = t.match(/peso[^\d]{0,15}?(\d{2,3}[.,]\d)\s*kg/);
  if (peso) { d.peso = n(peso[1]); found.push('peso'); }

  const talla = t.match(/(1\d{2}|2[0-2]\d)\s*cm/);
  if (talla) { d.talla = +talla[1]; found.push('talla'); }

  const pct = t.match(/(\d{1,2}[.,]\d)\s*%/);
  if (pct) { d.pctGrasa = n(pct[1]); found.push('% grasa'); }

  const kgGrasa = t.match(/kg de grasa[^\d]{0,15}?(\d{1,3}[.,]\d)\s*kg/);
  if (kgGrasa) { d.kgGrasa = n(kgGrasa[1]); found.push('kg de grasa'); }

  const mlg = t.match(/(?:peso libre de grasa|mlg)[^\d]{0,25}?(\d{2,3}[.,]\d)\s*kg/);
  if (mlg) { d.mlg = n(mlg[1]); found.push('MLG'); }

  // Si falta algún dato de composición se deduce de los otros (peso = MLG + kg de grasa).
  if (d.peso && !d.mlg && d.kgGrasa) { d.mlg = +(d.peso - d.kgGrasa).toFixed(1); found.push('MLG (calculada)'); }
  if (d.peso && !d.kgGrasa && d.mlg) { d.kgGrasa = +(d.peso - d.mlg).toFixed(1); found.push('kg de grasa (calculados)'); }
  if (!d.talla && d.peso) {
    const imc = t.match(/(\d{2}[.,]\d)\s*kg\s*\/\s*m/);
    if (imc) { d.talla = Math.round(Math.sqrt(d.peso / n(imc[1])) * 100); found.push('talla (desde el IMC)'); }
  }

  const gmt = t.match(/=\s*(\d{4})\s*kcal/);
  if (gmt) { d.gmtNeat = +gmt[1]; found.push('GMT + NEAT'); }

  const entrenoKcal = t.match(/(?<![\d=+]\s?)(\d{3})\s*kcal/);
  if (entrenoKcal) { d.gastoEntreno = +entrenoKcal[1]; found.push('gasto del entreno'); }

  const gkg = t.match(/\((\d)[.,](\d)\s*[g8]?\s*\/\s*k[gq]/);
  if (gkg) d.protGKg = n(`${gkg[1]}.${gkg[2]}`);

  const def = t.match(/-\s*(\d{1,2})\s*%/);
  if (def) d.deficitPct = +def[1];
  if (/deficit/.test(t)) d.objetivo = 'deficit';
  else if (/superavit|volumen|ganancia/.test(t)) d.objetivo = 'volumen';

  // Kcal de tratamiento: los números de 4 cifras con «kcal» que no son el GMT ni el gasto basal.
  const kcals = [...t.matchAll(/(\d{4})\s*kcal/g)].map((m) => +m[1]).filter((k) => k !== d.gmtNeat && !t.includes(`${k}kcal +`) && !t.includes(`${k} kcal +`));
  const uniq = [...new Set(kcals)].sort((a, b) => a - b);
  const rac = [...t.matchAll(/\((\d{1,2})\.(\d{1,2})\.(\d{1,2})\)/g)].map((m) => `${m[1]}.${m[2]}.${m[3]}`);
  const racSorted = [...new Set(rac)].sort((a, b) => sumR(a) - sumR(b));

  if (uniq.length >= 2) {
    d.descanso = { kcal: uniq[0] };
    d.entreno = { kcal: uniq[uniq.length - 1] };
    found.push('kcal de días sin entreno', 'kcal de días de entreno');
  }
  if (racSorted.length >= 2) {
    d.descanso = { ...d.descanso, raciones: racSorted[0], ...racionesToGrams(racSorted[0])! };
    d.entreno = { ...d.entreno, raciones: racSorted[racSorted.length - 1], ...racionesToGrams(racSorted[racSorted.length - 1])! };
    found.push('raciones');
  }
  return { data: d, found };
}

function sumR(r: string): number {
  return r.split('.').reduce((a, b) => a + +b, 0);
}
