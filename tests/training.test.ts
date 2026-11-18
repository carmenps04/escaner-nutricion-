import { test } from 'node:test';
import assert from 'node:assert/strict';
import { today, timingAdvice, todayLabel, dowOf } from '../src/lib/training.ts';
import { DEFAULT_PROFILE, type Profile } from '../src/lib/profile.ts';

const P: Profile = { ...DEFAULT_PROFILE, semana: [
  { dow: 0, sesion: 'Empuje', hora: '07:00' },
  { dow: 3, sesion: 'Pierna', hora: '14:00' },
] };
const lunes = new Date('2026-11-16T10:00:00');
const martes = new Date('2026-11-17T10:00:00');
const jueves = new Date('2026-11-19T10:00:00');

test('día de la semana empieza en lunes', () => {
  assert.equal(dowOf(lunes), 0);
  assert.equal(dowOf(new Date('2026-11-22T10:00:00')), 6); // domingo
});

test('hoy según la semana del perfil', () => {
  assert.deepEqual(today(P, lunes, null), { entreno: true, sesion: 'Empuje', hora: '07:00', manual: false });
  assert.equal(today(P, martes, null).entreno, false);
  assert.equal(todayLabel(today(P, jueves, null)), 'Hoy entrenas · Pierna a las 14:00');
});

test('el ajuste manual de hoy manda sobre la semana', () => {
  assert.deepEqual(today(P, lunes, false), { entreno: false, sesion: undefined, hora: undefined, manual: true });
  assert.equal(today(P, martes, true).entreno, true);
});

test('consejo de momento según la hora del entreno', () => {
  assert.match(timingAdvice('hc', today(P, lunes, null))!, /desayuno de después/);
  assert.match(timingAdvice('hc', today(P, jueves, null))!, /comida de antes o en la merienda/);
  assert.match(timingAdvice('hc', today(P, martes, null))!, /hoy no entrenas/);
  assert.equal(timingAdvice(null, today(P, lunes, null)), null);
});
