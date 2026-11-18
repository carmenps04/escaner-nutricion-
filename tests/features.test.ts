import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAlternatives, storeOf, categoryChain } from '../src/lib/alternatives.ts';
import { forGrams, gramsLeft, remaining, totals, type DiaryEntry } from '../src/lib/diary.ts';
import { DEFAULT_PROFILE, type Profile } from '../src/lib/profile.ts';
import type { Product } from '../src/lib/types.ts';

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
