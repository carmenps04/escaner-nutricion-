import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDietSheet } from '../src/lib/parseDietSheet.ts';
import { parseLabel } from '../src/lib/parseLabel.ts';
import { parseUnit } from '../src/lib/serving.ts';
import { evaluate, portionText } from '../src/lib/evaluate.ts';
import { DEFAULT_PROFILE, racionesToGrams, macroKcal, type Profile } from '../src/lib/profile.ts';
import { fromOff } from '../src/lib/off.ts';
import type { Product } from '../src/lib/types.ts';

test('hoja del dietista (texto real del OCR)', () => {
  const txt = readFileSync(new URL('./fixtures/hoja-dietista-ocr.txt', import.meta.url), 'utf8');
  const { data } = parseDietSheet(txt);
  assert.equal(data.fecha, '2026-10-12');
  assert.equal(data.peso, 78.4);
  assert.equal(data.talla, 172);
  assert.equal(data.pctGrasa, 33.5);
  assert.equal(data.kgGrasa, 26.3);
  assert.equal(data.mlg, 52.1);
  assert.equal(data.gmtNeat, 1800);
  assert.equal(data.gastoEntreno, 350);
  assert.equal(data.protGKg, 1.8);
  assert.equal(data.deficitPct, 20);
  assert.equal(data.objetivo, 'deficit');
  assert.deepEqual(data.descanso, { kcal: 1440, raciones: '15.11.4', hc: 150, prot: 110, grasa: 40 });
  assert.deepEqual(data.entreno, { kcal: 1720, raciones: '18.13.5', hc: 180, prot: 130, grasa: 50 });
});

test('talla deducida del IMC si el OCR no la lee', () => {
  const { data } = parseDietSheet('PESO 78,4 Kg IMC 26,5Kg/m? Kg de Grasa 26,3 Kg');
  assert.equal(data.talla, 172);
  assert.equal(data.mlg, 52.1);
});

test('raciones a gramos (1 ración = 10 g)', () => {
  assert.deepEqual(racionesToGrams('16.12.5'), { hc: 160, prot: 120, grasa: 50 });
  assert.equal(macroKcal(racionesToGrams('16.12.5')!), 1570);
});

// Perfil de prueba (ficticio) en déficit.
const P: Profile = {
  ...DEFAULT_PROFILE, objetivo: 'deficit',
  descanso: { kcal: 1560, hc: 160, prot: 120, grasa: 50 },
  entreno: { kcal: 1860, hc: 190, prot: 140, grasa: 60 },
};

test('etiqueta nutricional típica', () => {
  const txt = `INFORMACIÓN NUTRICIONAL Valores medios por 100 g Por galleta (14 g)
  Valor energético 1960 kJ / 468 kcal 274 kJ / 66 kcal
  Grasas 18 g 2,5 g
  de las cuales saturadas 2,1 g 0,3 g
  Hidratos de carbono 63 g 8,8 g
  de los cuales azúcares 17 g 2,4 g
  Fibra alimentaria 7,1 g 1,0 g
  Proteínas 7,5 g 1,1 g
  Sal O,9 g 0,13 g`;
  const { n, liquid } = parseLabel(txt);
  assert.deepEqual(n, { kcal: 468, grasa: 18, sat: 2.1, hc: 63, azucar: 17, fibra: 7.1, prot: 7.5, sal: 0.9 });
  assert.equal(liquid, false);
});

test('etiqueta en modo texto disperso (una palabra por línea)', () => {
  const txt = 'Valor energético\n1490 kJ\n356 kcal\nGrasas\n4,2 g\nde las cuales\nsaturadas\n1,1 g\nHidratos de carbono\n60 g\nde los cuales\nazúcares\n1,2 g\nFibra\n10 g\nProteínas\n13 g\nSal\n0,02 g\nPor 100 ml';
  const { n, liquid } = parseLabel(txt);
  assert.deepEqual(n, { kcal: 356, grasa: 4.2, sat: 1.1, hc: 60, azucar: 1.2, fibra: 10, prot: 13, sal: 0.02 });
  assert.equal(liquid, true);
});

test('unidades a partir de la ración', () => {
  assert.deepEqual(parseUnit('2 galletas (28 g)'), { weight: 14, name: 'galleta' });
  assert.deepEqual(parseUnit('25 g (1 barrita)'), { weight: 25, name: 'barrita' });
  assert.deepEqual(parseUnit(null, '6 x 25 g'), { weight: 25, name: 'unidad' });
  assert.equal(parseUnit('30 g'), null);
});

const galletas: Product = {
  name: 'Galletas digestive avena', n: { kcal: 470, prot: 7, hc: 65, azucar: 18, grasa: 18, sat: 2.5, fibra: 6, sal: 0.9 },
  liquid: false, nova: 4, unitWeight: 14, unitName: 'galleta', source: 'manual',
};

test('galletas tipo digestive: regular, con cantidades distintas por tipo de día', () => {
  const e = evaluate(galletas, P);
  assert.equal(e.verdict, 'regular');
  assert.ok(e.entreno.units! >= e.descanso.units!);
  assert.ok(e.descanso.units! >= 2 && e.descanso.units! <= 5, `descanso ${e.descanso.units}`);
  assert.match(portionText(e.descanso, galletas), /galletas \(\d+ g\)/);
  assert.match(e.frequency, /días/);
});

test('fiambre de pavo: buena opción, limitado por la sal', () => {
  const pavo: Product = { name: 'Pechuga de pavo', n: { kcal: 100, prot: 20, hc: 1, azucar: 1, grasa: 1.5, sat: 0.5, fibra: 0, sal: 2 }, liquid: false, nova: 4, source: 'manual' };
  const e = evaluate(pavo, P);
  assert.equal(e.verdict, 'buena');
  assert.match(e.descanso.limitedBy, /sal/);
  assert.equal(e.descanso.grams, 75);
});

test('galletas de chocolate: ocasional', () => {
  const choc: Product = { name: 'Galletas chocolate', n: { kcal: 500, prot: 6, hc: 65, azucar: 35, grasa: 24, sat: 12, fibra: 3, sal: 0.6 }, liquid: false, nova: 4, source: 'manual' };
  assert.equal(evaluate(choc, DEFAULT_PROFILE).verdict, 'ocasional');
});

test('aceite de oliva: grasa, medida a cucharadas', () => {
  const aceite: Product = { name: 'Aceite de oliva virgen extra', n: { kcal: 900, prot: 0, hc: 0, azucar: 0, grasa: 100, sat: 14, fibra: 0, sal: 0 }, liquid: true, nova: 2, source: 'manual' };
  const e = evaluate(aceite, P);
  assert.equal(e.kind, 'grasa');
  assert.equal(e.verdict, 'buena');
  assert.equal(e.descanso.grams, 10);
});

test('lechuga: sin límite práctico', () => {
  const l: Product = { name: 'Lechuga', n: { kcal: 15, prot: 1.4, hc: 1.5, azucar: 1, grasa: 0.2, sat: 0, fibra: 1.3, sal: 0.02 }, liquid: false, nova: 1, source: 'manual' };
  const e = evaluate(l, P);
  assert.equal(e.descanso.grams, null);
});

test('conversión desde Open Food Facts', () => {
  const p = fromOff('8480000000000', {
    product_name: 'Digestive avena', brands: 'Hacendado, Mercadona', serving_size: '2 galletas (28 g)', nova_group: 4, nutriscore_grade: 'c',
    nutriments: { 'energy-kcal_100g': 470, proteins_100g: 7, carbohydrates_100g: 65, sugars_100g: 18, fat_100g: 18, 'saturated-fat_100g': 2.5, fiber_100g: 6, salt_100g: 0.9 },
    categories_tags: ['en:biscuits'], quantity: '425 g',
  });
  assert.equal(p.brand, 'Hacendado');
  assert.equal(p.unitWeight, 14);
  assert.equal(p.liquid, false);
  assert.equal(p.n.kcal, 470);
});

test('etiqueta real leída por el OCR (modo filas): corrige la «g» leída como 9', () => {
  const txt = readFileSync(new URL('./fixtures/etiqueta-psm6.txt', import.meta.url), 'utf8');
  const { n } = parseLabel(txt);
  assert.deepEqual(n, { kcal: 468, grasa: 18, sat: 2.1, hc: 63, azucar: 17, fibra: 7.1, prot: 7.5, sal: 0.9 });
});

test('etiqueta real leída por el OCR (modo disperso)', () => {
  const txt = readFileSync(new URL('./fixtures/etiqueta-psm11.txt', import.meta.url), 'utf8');
  const { n } = parseLabel(txt);
  assert.equal(n.kcal, 468);
  assert.equal(n.hc, 63);
  assert.equal(n.prot, 7.5);
  assert.equal(n.sal, 0.9);
  assert.equal(n.fibra, 7.1);
});

test('foto de etiqueta torcida y borrosa: barra leída como 7 y coma perdida', () => {
  const txt = readFileSync(new URL('./fixtures/etiqueta-foto-psm6.txt', import.meta.url), 'utf8');
  const { n, kcalEstimated } = parseLabel(txt);
  assert.deepEqual(n, { kcal: 468, grasa: 18, sat: 2.1, hc: 63, azucar: 17, fibra: 7.1, prot: 7.5, sal: 0.9 });
  assert.equal(kcalEstimated, false);
});

test('kcal ilegibles: se calculan con los macros', () => {
  const r = parseLabel('Valor energético O 7468 274 kJ / 66 kcal Grasas 18 g Hidratos de carbono 63 g Fibra 7,1 g Proteínas 7,5 g');
  assert.equal(r.kcalEstimated, true);
  assert.equal(r.n.kcal, 458); // 7,5·4 + 63·4 + 18·9 + 7,1·2
});

test('sólido o líquido: la pasta va en gramos y la leche en ml', async () => {
  const { isLiquid } = await import('../src/lib/off.ts');
  // Open Food Facts mete la pasta en «Plant-based foods and beverages»
  assert.equal(isLiquid(['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:cereals-and-potatoes', 'en:pastas'], '500 g'), false);
  assert.equal(isLiquid(['en:plant-based-foods-and-beverages', 'en:plant-based-foods', 'en:pastas'], undefined), false);
  assert.equal(isLiquid(['en:dairies', 'en:milks', 'en:skimmed-milks'], '1 l'), true);
  assert.equal(isLiquid(['en:beverages', 'en:plant-based-beverages', 'en:oat-based-drinks'], undefined), true);
  assert.equal(isLiquid(['en:beverages', 'en:sodas'], '33 cl'), true);
  assert.equal(isLiquid(['en:beverages-and-beverages-preparations', 'en:cocoa-and-chocolate-powders'], undefined), false);
  assert.equal(isLiquid([], '425 g'), false);
});

test('tomate y gazpacho se valoran como comida, no como bebida', async () => {
  const { isDrink, isLiquid } = await import('../src/lib/off.ts');
  const mk = (name: string, v: number[], nova: number, cats: string[], quantity: string): Product => ({
    name, n: { kcal: v[0], prot: v[1], hc: v[2], azucar: v[3], grasa: v[4], sat: v[5], fibra: v[6], sal: v[7] }, nova, categories: cats, quantity,
    liquid: isLiquid(cats, quantity), drink: isDrink(cats), source: 'openfoodfacts',
  });
  const triturado = mk('Tomate triturado', [25, 1.2, 3.5, 3.5, 0.2, 0, 1.2, 0.3], 3, ['en:plant-based-foods-and-beverages', 'en:canned-tomatoes', 'en:crushed-tomatoes'], '800 g');
  const frito = mk('Tomate frito', [80, 1.5, 9, 6, 4, 0.5, 1.5, 1.0], 4, ['en:plant-based-foods-and-beverages', 'en:sauces', 'en:tomato-sauces'], '3 x 400 g');
  const gazpacho = mk('Gazpacho', [40, 0.7, 3, 2.6, 2.8, 0.4, 0.8, 0.6], 3, ['en:plant-based-foods-and-beverages', 'en:beverages', 'en:soups', 'en:gazpachos'], '1 l');
  // El tomate tiene casi todas sus kcal de azúcar natural, pero muy pocas: no es «sobre todo azúcar».
  assert.equal(evaluate(triturado, P).verdict, 'buena');
  assert.notEqual(evaluate(frito, P).verdict, 'ocasional');
  // El gazpacho va en ml, pero se valora como comida (sopa), no con los criterios de bebidas.
  assert.equal(gazpacho.liquid, true);
  assert.equal(gazpacho.drink, false);
  assert.ok(!evaluate(gazpacho, P).reasons.some((r) => /Bebida azucarada/.test(r.text)));
  // Un refresco sigue siendo bebida.
  assert.equal(isDrink(['en:beverages', 'en:sodas', 'en:colas']), true);
});

test('azúcar natural de fruta y leche no limita la cantidad; el del zumo sí', () => {
  const platano: Product = { name: 'Plátano', n: { kcal: 94, prot: 1.2, hc: 20, azucar: 17, grasa: 0.3, sat: 0.1, fibra: 2.6, sal: 0 }, liquid: false, nova: 1, unitWeight: 120, unitName: 'plátano', source: 'manual' };
  const zumo: Product = { name: 'Zumo de naranja', n: { kcal: 45, prot: 0.7, hc: 10, azucar: 10, grasa: 0.1, sat: 0, fibra: 0.2, sal: 0 }, liquid: true, drink: true, nova: 1, source: 'manual' };
  const e = evaluate(platano, P);
  assert.equal(e.verdict, 'buena');
  assert.ok((e.descanso.units ?? 0) >= 1);
  assert.doesNotMatch(e.descanso.limitedBy, /azúcar/);
  assert.match(evaluate(zumo, P).descanso.limitedBy, /azúcar/);
});

test('la proteína se reparte: como mucho un 40 % de la del día por toma', () => {
  const pollo: Product = { name: 'Pechuga de pollo', n: { kcal: 110, prot: 23, hc: 0, azucar: 0, grasa: 1.8, sat: 0.5, fibra: 0, sal: 0.2 }, liquid: false, nova: 1, source: 'manual' };
  const e = evaluate(pollo, P);
  assert.match(e.descanso.limitedBy, /proteína/);
  assert.ok(e.descanso.prot! <= P.descanso.prot * 0.4 + 0.5);
  const total = e.breakdown.reduce((a, b) => a + b.weight, 0);
  assert.ok(total >= 98 && total <= 102, `pesos ${total}`);
});
