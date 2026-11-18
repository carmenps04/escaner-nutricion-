import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAlternatives, storeOf, categoryChain } from '../src/lib/alternatives.ts';
import { forGrams, gramsLeft, remaining, totals, type DiaryEntry } from '../src/lib/diary.ts';
import { DEFAULT_PROFILE, type Profile } from '../src/lib/profile.ts';
import type { Product } from '../src/lib/types.ts';
import { evaluate } from '../src/lib/evaluate.ts';

const P: Profile = { ...DEFAULT_PROFILE, objetivo: 'deficit', descanso: { kcal: 1560, hc: 160, prot: 120, grasa: 50 }, entreno: { kcal: 1860, hc: 190, prot: 140, grasa: 60 } };
const mk = (name: string, n: Partial<Product['n']>, extra: Partial<Product> = {}): Product => ({
  name, n: { kcal: null, prot: null, hc: null, azucar: null, grasa: null, sat: null, fibra: null, sal: null, ...n }, liquid: false, source: 'openfoodfacts', ...extra,
});

const digestive = mk('Digestive avena', { kcal: 470, prot: 7, hc: 65, azucar: 18, grasa: 18, sat: 2.5, fibra: 6, sal: 0.9 }, { code: '1', nova: 4, brand: 'Hacendado', categories: ['en:snacks', 'en:biscuits', 'en:digestive-biscuits'] });

test('supermercado y categorías', () => {
  assert.equal(storeOf(digestive), 'mercadona'); // marca Hacendado
  assert.equal(storeOf({ ...digestive, stores: ['lidl'] }), 'lidl');
  assert.deepEqual(categoryChain(digestive), ['en:digestive-biscuits', 'en:biscuits', 'en:snacks']);
});

test('alternativas: solo las claramente mejores, sin repetir ni el mismo producto', () => {
  const cands = [
    digestive,
    mk('Galletas chocolate', { kcal: 500, prot: 6, hc: 65, azucar: 35, grasa: 24, sat: 12, fibra: 3, sal: 0.6 }, { code: '2', nova: 4 }),
    mk('Tortitas de arroz', { kcal: 380, prot: 8, hc: 80, azucar: 0.5, grasa: 3, sat: 0.6, fibra: 3, sal: 0.1 }, { code: '3', nova: 3 }),
    mk('Tortitas de arroz', { kcal: 380, prot: 8, hc: 80, azucar: 0.5, grasa: 3, sat: 0.6, fibra: 3, sal: 0.1 }, { code: '4', nova: 3 }),
    mk('Galletas proteicas', { kcal: 400, prot: 25, hc: 45, azucar: 5, grasa: 12, sat: 3, fibra: 8, sal: 0.5 }, { code: '5', nova: 4 }),
    mk('Sin datos', { kcal: 300 }, { code: '6' }),
  ];
  const r = rankAlternatives(digestive, cands, P);
  const names = r.items.map((i) => i.product.name);
  assert.ok(!names.includes('Digestive avena'));
  assert.ok(!names.includes('Galletas chocolate'));
  assert.ok(!names.includes('Sin datos'));
  assert.equal(names.filter((n) => n === 'Tortitas de arroz').length, 1);
  assert.ok(r.items.every((i) => i.score >= r.current + 5));
  assert.deepEqual([...r.items].sort((a, b) => b.score - a.score), r.items);
});

test('diario: totales, lo que queda y cuánto cabe', () => {
  const e = (kcal: number, prot: number, hc: number, grasa: number): DiaryEntry => ({ id: String(kcal), time: '10:00', name: 'x', grams: null, kcal, prot, hc, grasa });
  const t = totals([e(500, 30, 60, 15), e(700, 40, 70, 25)]);
  assert.deepEqual(t, { kcal: 1200, prot: 70, hc: 130, grasa: 40 });
  const left = remaining(P.descanso, t);
  assert.deepEqual(left, { kcal: 360, prot: 50, hc: 30, grasa: 10 });
  // Galletas: los hidratos (30 g) son lo que más limita → 30/65·100 ≈ 46 g
  const cap = gramsLeft(digestive.n, left)!;
  assert.equal(cap.by, 'hc');
  assert.ok(Math.abs(cap.grams - 46.15) < 0.1);
  const g = forGrams(digestive.n, 28);
  for (const [k, v] of Object.entries({ kcal: 131.6, prot: 1.96, hc: 18.2, grasa: 5.04 })) assert.ok(Math.abs(g[k as keyof typeof g] - v) < 1e-6, k);
});

test('comida con varios ingredientes: desayuno de ejemplo', async () => {
  const { mealTotals, itemGrams } = await import('../src/lib/diary.ts');
  const leche = mk('Leche desnatada', { kcal: 35, prot: 3.4, hc: 4.9, azucar: 4.9, grasa: 0.3, sat: 0.2, fibra: 0, sal: 0.13 }, { liquid: true, nova: 1 });
  const galletas = { ...digestive, unitWeight: 14, unitName: 'galleta' };
  const items = [
    { product: leche, qty: 250, unit: 'g' as const },
    { product: galletas, qty: 10, unit: 'unidad' as const },
    { product: leche, qty: 250, unit: 'g' as const },
  ];
  assert.equal(itemGrams(items[1]), 140);
  const t = mealTotals(items);
  // leche 500 ml: 175 kcal, 17 g prot., 24,5 g HC, 1,5 g grasa; galletas 140 g: 658 kcal, 9,8 g prot., 91 g HC, 25,2 g grasa
  assert.ok(Math.abs(t.kcal - 833) < 0.01);
  assert.ok(Math.abs(t.prot - 26.8) < 0.01);
  assert.ok(Math.abs(t.hc - 115.5) < 0.01);
  assert.ok(Math.abs(t.grasa - 26.7) < 0.01);
});

test('tabla de alimentos naturales: valores coherentes', async () => {
  const { FOODS } = await import('../src/lib/foods.ts');
  assert.ok(FOODS.length >= 60);
  for (const f of FOODS) {
    const n = f.n;
    assert.ok(n.sat! <= n.grasa! + 0.01, `${f.name}: saturadas > grasa`);
    assert.ok(n.azucar! <= n.hc! + 0.01, `${f.name}: azúcar > hidratos`);
    const est = n.prot! * 4 + n.hc! * 4 + n.grasa! * 9 + n.fibra! * 2;
    // Las tablas usan factores distintos según el alimento: se admite un margen amplio.
    assert.ok(Math.abs(est - n.kcal!) / n.kcal! < 0.25, `${f.name}: kcal ${n.kcal} frente a ${est.toFixed(0)}`);
  }
  const codes = new Set(FOODS.map((f) => f.code));
  assert.equal(codes.size, FOODS.length);
});

test('comida con alimentos naturales: batata y pepino', async () => {
  const { FOODS } = await import('../src/lib/foods.ts');
  const { mealTotals } = await import('../src/lib/diary.ts');
  const batata = FOODS.find((f) => f.name === 'Batata asada')!;
  const pepino = FOODS.find((f) => f.name === 'Pepino')!;
  const t = mealTotals([{ product: batata, qty: 1, unit: 'unidad' }, { product: pepino, qty: 100, unit: 'g' }]);
  assert.ok(Math.abs(t.kcal - (90 * 2 + 15)) < 0.01);
  const e = evaluate(batata, P);
  assert.equal(e.verdict, 'buena');
});

// ── Plan del dietista ─────────────────────────────────────────────
import { fruitPortion, fruitRaciones, mealTarget, planPortion, vegRule, type DietPlan } from '../src/lib/plan.ts';

const PLAN: DietPlan = {
  fecha: '2026-01-01',
  comidas: {
    descanso: { comida: { titulo: 'Comida', raciones: '6.5.2', grupos: [] } },
    entreno: { desayuno: { titulo: 'Ingesta post-entrenamiento', raciones: '4.3.1', grupos: [] } },
  },
  verdura: { limite: 200, limitadas: ['tomate', 'salsa de tomate', 'cebolla', 'maiz'], libres: ['pepino', 'calabacin', 'col'], texto: '' },
  fruta: [{ gramos: 15, frutas: ['pasas'] }, { gramos: 100, frutas: ['manzana', 'uva', 'fresa'] }, { gramos: 50, frutas: ['platano'] }],
  notas: [],
};
const prod = (name: string, extra: Partial<Product> = {}): Product => ({ name, n: { kcal: 20, prot: 1, hc: 3, azucar: 2, grasa: 0.2, sat: 0, fibra: 1, sal: 0 }, liquid: false, source: 'openfoodfacts', ...extra });

test('plan: verdura limitada o libre por nombre, sin falsos positivos', () => {
  assert.equal(vegRule(PLAN, prod('Tomate frito')), 'limitada');
  assert.equal(vegRule(PLAN, prod('Tomates cherry')), 'limitada');
  assert.equal(vegRule(PLAN, prod('Pepino', { source: 'tabla' })), 'libre');
  assert.equal(vegRule(PLAN, prod('Cola Cao')), null);
  assert.equal(vegRule(PLAN, prod('Coliflor')), null);
  assert.equal(vegRule(PLAN, prod('Tortitas de maíz', { categories: ['en:corn-cakes'] })), null);
  assert.equal(vegRule(PLAN, prod('Gazpacho con tomate')), null);
  assert.equal(vegRule(null, prod('Tomate')), null);
});

test('plan: ración de fruta según la tabla del dietista', () => {
  assert.equal(fruitPortion(PLAN, prod('Plátano de Canarias', { source: 'tabla' })), 50);
  assert.equal(fruitPortion(PLAN, prod('Uvas pasas', { categories: ['en:dried-fruits'] })), 15);
  assert.equal(fruitPortion(PLAN, prod('Yogur de fresa', { categories: ['en:fruit-yogurts'] })), null);
  assert.equal(fruitPortion(PLAN, prod('Perlas de chocolate')), null);
  assert.equal(fruitRaciones(100, 260), 2.5);
});

test('plan: tope de 200 g para verdura limitada; libre sin tope', () => {
  const base = { grams: 450, units: null, limitedBy: 'x', kcal: 90, pctDayKcal: 6, prot: 4, hc: 13, grasa: 1 };
  const lim = planPortion(PLAN, prod('Tomate'), base, 1554);
  assert.equal(lim.portion.grams, 200);
  assert.equal(Math.round(lim.portion.kcal!), 40);
  assert.match(lim.portion.limitedBy, /dietista/);
  // Si la app ya da menos, se queda lo de la app.
  assert.equal(planPortion(PLAN, prod('Tomate'), { ...base, grams: 120 }, 1554).portion.grams, 120);
  const libre = planPortion(PLAN, prod('Calabacín'), base, 1554);
  assert.equal(libre.portion.grams, null);
  assert.equal(libre.label, 'Cantidad libre');
});

test('plan: objetivo de cada comida en gramos', () => {
  const t = mealTarget(PLAN, 'Almuerzo', false)!;
  assert.deepEqual([t.hc, t.prot, t.grasa], [60, 50, 20]);
  assert.equal(mealTarget(PLAN, 'Desayuno', true)!.titulo, 'Ingesta post-entrenamiento');
  assert.equal(mealTarget(PLAN, 'Merienda', false), null);
});
