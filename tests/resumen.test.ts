import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alcoholLimit, dayScore, drinkKind, monthWeeks, periodStats, summarizeDay, tips, toneOf, weekDays, type DaySum } from '../src/lib/resumen.ts';
import { MEAL_TIMES, nextMeal, type DiaryEntry } from '../src/lib/diary.ts';
import { DEFAULT_PROFILE } from '../src/lib/profile.ts';
import type { Product } from '../src/lib/types.ts';
import { mergeUnit } from '../src/lib/syncCore.ts';

const plan = { kcal: 1600, prot: 120, hc: 160, grasa: 50 };
const day = (kcal: number, extra: Partial<DaySum> = {}): DaySum => ({ kcal, prot: 120, hc: 160, grasa: 50, plan, mant: 2000, entreno: false, cena: true, ...extra });

test('horas por defecto y comida propuesta', () => {
  assert.deepEqual(MEAL_TIMES, { Desayuno: '08:30', 'Media mañana': '11:30', Almuerzo: '13:30', Merienda: '15:00', Cena: '21:00' });
  assert.equal(nextMeal([]), 'Desayuno');
  assert.equal(nextMeal(['Desayuno', 'Almuerzo']), 'Media mañana');
  assert.equal(nextMeal(['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena']), 'Cena');
});

test('nota del día y color', () => {
  assert.equal(dayScore(day(1550)), 10); // 97 %
  assert.equal(dayScore(day(1600 * 1.02)), 10);
  assert.equal(toneOf(dayScore(day(1600 * 0.8))), 'amarillo'); // 80 % → 7,5
  assert.equal(toneOf(dayScore(day(1600 * 0.6))), 'rojo');
  // Pasarse: déficit 400 → rojo desde 1800
  const alto = dayScore(day(1700));
  assert.ok(alto < 8 && alto >= 5, String(alto));
  assert.ok(dayScore(day(1850)) < 5);
  assert.equal(dayScore(day(4000)), 0);
});

test('semanas: lunes a domingo y semanas de un mes', () => {
  const w = weekDays(new Date(2026, 10, 22)); // domingo
  assert.equal(w[0], '2026-11-16');
  assert.equal(w[6], '2026-11-22');
  const ws = monthWeeks(2026, 10); // noviembre 2026 empieza en domingo
  assert.equal(ws.length, 6);
  assert.equal(ws[0].getDate(), 26); // lunes 26 oct
});

test('bebidas alcohólicas', () => {
  assert.equal(drinkKind('Cerveza Alhambra Especial'), 'cerveza');
  assert.equal(drinkKind('Cerveza sin alcohol'), null);
  assert.equal(drinkKind('Cerveza 0,0 tostada'), null);
  assert.equal(drinkKind('Cerveza sin gluten'), 'cerveza');
  assert.equal(drinkKind('Tinto de verano'), 'vino');
  assert.equal(drinkKind('Cubata de ron'), 'copa');
  assert.equal(drinkKind('Caña de crema'), null);
  assert.equal(drinkKind('Clara de huevo'), null);
  assert.equal(drinkKind('Lata', ['en:beverages', 'en:beers']), 'cerveza');
});

test('resumen de un día: alcohol y productos ocasionales', () => {
  const beer: Product = { name: 'Cerveza lager', n: { kcal: 42, prot: 0.4, hc: 3.2, azucar: 0.2, grasa: 0, sat: 0, fibra: 0, sal: 0 }, liquid: true, drink: true, source: 'manual', unitWeight: 330, unitName: 'lata' };
  const cookie: Product = { name: 'Galletas chocolate', n: { kcal: 500, prot: 6, hc: 65, azucar: 35, grasa: 24, sat: 12, fibra: 3, sal: 0.6 }, liquid: false, nova: 4, source: 'manual' };
  const entries: DiaryEntry[] = [
    { id: '1', time: '15:00', name: 'Merienda', grams: null, kcal: 400, prot: 5, hc: 50, grasa: 20, items: [{ product: cookie, qty: 50, unit: 'g' }] },
    { id: '2', time: '21:00', name: 'Cena', grams: null, kcal: 277, prot: 3, hc: 21, grasa: 0, items: [{ product: beer, qty: 2, unit: 'unidad' }] },
    { id: '3', time: '23:00', name: '2 cervezas', grams: null, kcal: 280, prot: 0, hc: 20, grasa: 0 },
  ];
  const s = summarizeDay(entries, { plan, mant: 2000, entreno: false, profile: DEFAULT_PROFILE });
  assert.equal(s.cena, true);
  assert.equal(s.alc?.cerveza, 1320);
  assert.equal(s.ocas?.[0], 'Galletas chocolate');
  assert.equal(s.kcal, 957);
});

test('estadísticas y consejos de la semana', () => {
  const days = weekDays(new Date(2026, 10, 16));
  const sums: Record<string, DaySum> = {
    [days[0]]: day(1580),
    [days[1]]: day(1590, { prot: 80 }),
    [days[2]]: day(1600, { prot: 80 }),
    [days[3]]: day(1610, { prot: 80 }),
    [days[4]]: day(1700, { prot: 80 }),
    [days[5]]: day(2300, { prot: 80, alc: { cerveza: 330 * 6, vino: 0, copas: 0, ube: 7.9, kcal: 840 } }),
    [days[6]]: day(900, { cena: false }), // hoy sin cenar: no cuenta
  };
  const st = periodStats(days, sums, days[6]);
  assert.equal(st.counted.length, 6);
  assert.equal(st.rows[6].status, 'curso');
  assert.ok(st.score! > 6 && st.score! < 9);
  const t = tips(st, 'deficit', 'semana');
  assert.ok(t.length <= 3);
  assert.match(t[0], /1 día muy por encima del plan \(sábado\)/);
  assert.match(t[1], /Alcohol: 6 cervezas/);
  assert.match(t[1], /no pasar de 4 cervezas/);
  assert.match(t[2], /Proteína/);
});

test('límite de alcohol: manda el más bajo entre calorías y salud', () => {
  assert.equal(alcoholLimit(1600, 'deficit'), 4);
  assert.equal(alcoholLimit(3000, 'volumen'), 5); // tope de salud (70 g/semana)
});

test('sync: los resúmenes por día se juntan', () => {
  const m = JSON.parse(mergeUnit('escaner.resumen.v1', '{"2026-11-01":{"kcal":1},"2026-11-02":{"kcal":2}}', '{"2026-11-02":{"kcal":3}}'));
  assert.deepEqual(m, { '2026-11-01': { kcal: 1 }, '2026-11-02': { kcal: 3 } });
});

test('los días anteriores a empezar a usar la app no cuentan', () => {
  const days = weekDays(new Date(2026, 10, 16));
  const st = periodStats(days, { [days[4]]: day(1600), [days[5]]: day(1600) }, days[6]);
  assert.equal(st.span, 3);
  assert.equal(st.counted.length, 2);
});
