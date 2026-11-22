import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash, localChanges, loadMeta, mergeUnit, readUnits, writeUnit, type KV } from '../src/lib/syncCore.ts';

const mem = (init: Record<string, string> = {}): KV & { d: Record<string, string> } => {
  const d = { ...init };
  return { d, getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } };
};

test('sync: el diario se sube por días y se escribe de vuelta', () => {
  const kv = mem({ 'escaner.diario.v1': JSON.stringify({ '2026-11-17': [{ id: 'a' }], '2026-11-18': [{ id: 'b' }] }), 'escaner.perfil.v1': '{"peso":1}', 'otra.cosa': 'x' });
  const u = readUnits(kv);
  assert.deepEqual(Object.keys(u).sort(), ['diario/2026-11-17', 'diario/2026-11-18', 'escaner.perfil.v1']);
  writeUnit(kv, 'diario/2026-11-18', null);
  writeUnit(kv, 'diario/2026-11-19', '[{"id":"c"}]');
  assert.deepEqual(Object.keys(JSON.parse(kv.d['escaner.diario.v1'])).sort(), ['2026-11-17', '2026-11-19']);
  writeUnit(kv, 'escaner.plan.v1', null);
  assert.equal(kv.getItem('escaner.plan.v1'), null);
});

test('sync: detecta cambios y borrados locales', () => {
  const kv = mem({ 'escaner.perfil.v1': '{"peso":2}', 'escaner.citas.v1': '[]' });
  const m = loadMeta(kv);
  m.synced = { 'escaner.perfil.v1': hash('{"peso":1}'), 'escaner.citas.v1': hash('[]'), 'diario/2026-11-01': 'x' };
  const c = localChanges(readUnits(kv), m);
  assert.deepEqual(c.changed, ['escaner.perfil.v1']);
  assert.deepEqual(c.removed, ['diario/2026-11-01']);
});

test('sync: primera vez, junta listas y en lo demás manda la nube', () => {
  const day = JSON.parse(mergeUnit('diario/2026-11-18', '[{"id":"a"},{"id":"b"}]', '[{"id":"b","x":1},{"id":"c"}]'));
  assert.deepEqual(day.map((e: { id: string }) => e.id), ['b', 'c', 'a']);
  assert.equal(day[0].x, 1);
  const h = JSON.parse(mergeUnit('escaner.historial.v1',
    JSON.stringify([{ product: { code: '1' }, date: '2026-11-18' }, { product: { code: '2' }, date: '2026-11-10' }]),
    JSON.stringify([{ product: { code: '1' }, date: '2026-11-01' }, { product: { code: '3' }, date: '2026-11-15' }])));
  assert.deepEqual(h.map((x: { product: { code: string } }) => x.product.code), ['1', '3', '2']);
  assert.equal(mergeUnit('escaner.perfil.v1', '{"peso":1}', '{"peso":2}'), '{"peso":2}');
  const c = JSON.parse(mergeUnit('escaner.citas.v1', '[{"fecha":"2026-09-01"},{"fecha":"2026-10-10","peso":1}]', '[{"fecha":"2026-10-10","peso":2}]'));
  assert.deepEqual(c.map((x: { fecha: string }) => x.fecha), ['2026-09-01', '2026-10-10']);
  assert.equal(c[1].peso, 2);
});

test('reglas de Firestore: aceptan todos los datos que sincroniza la app', async () => {
  const { readFileSync } = await import('node:fs');
  const { KEYS } = await import('../src/lib/backup.ts');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  for (const k of KEYS.filter((k) => k !== 'escaner.diario.v1')) assert.ok(rules.includes(`'${k}'`), `falta ${k} en firestore.rules`);
});

test('copias cifradas: se abren con su contraseña y no con otra; las antiguas siguen valiendo', async () => {
  const { encryptBackup, decryptBackup, parseBackup, isEncrypted } = await import('../src/lib/backup.ts');
  const b = { app: 'escaner-nutricion' as const, version: 1 as const, fecha: '2026-11-22T10:00:00Z', datos: { 'escaner.perfil.v1': '{"peso":70}' } };
  const e = await encryptBackup(b, 'una contraseña larga');
  assert.ok(!JSON.stringify(e).includes('peso'), 'los datos no van en claro');
  assert.deepEqual(await decryptBackup(e, 'una contraseña larga'), b);
  assert.equal(await decryptBackup(e, 'otra contraseña'), null);
  // Manipulada: se detecta (AES-GCM autentica los datos)
  const bad = { ...e, cifrado: { ...e.cifrado, data: e.cifrado.data.slice(0, -4) + 'AAAA' } };
  assert.equal(await decryptBackup(bad, 'una contraseña larga'), null);
  // Vueltas absurdas: se rechaza sin intentarlo
  assert.equal(await decryptBackup({ ...e, cifrado: { ...e.cifrado, iter: 1e9 } }, 'una contraseña larga'), null);
  // Por enlace y por archivo
  const code = Buffer.from(JSON.stringify(e)).toString('base64url');
  const p1 = parseBackup(`https://x/#datos=${code}`);
  assert.ok(p1 && isEncrypted(p1));
  const p2 = parseBackup(JSON.stringify(e));
  assert.ok(p2 && isEncrypted(p2));
  const old = parseBackup(JSON.stringify(b));
  assert.ok(old && !isEncrypted(old));
});
