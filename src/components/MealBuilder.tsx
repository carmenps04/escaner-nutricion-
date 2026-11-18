import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, History, Leaf, Plus, Search, Trash2 } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import { addToHistory, loadHistory } from '../lib/storage.ts';
import { FOODS } from '../lib/foods.ts';
import { forGrams, itemGrams, mealTotals, pastMeals, type DiaryEntry, type MealItem, type PastMeal } from '../lib/diary.ts';
import { fmt, plural } from '../lib/evaluate.ts';
import { fruitPortion, fruitRaciones, loadPlan, mealTarget, vegRule } from '../lib/plan.ts';

const MEALS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];
/** Comidas en femenino, para escribir «una merienda» / «ninguna cena». */
const FEM = new Set(['Media mañana', 'Merienda', 'Cena']);
const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
/** Comida que corresponde a la hora, para proponerla como nombre. */
const mealForTime = (t: string) => {
  const h = parseInt(t, 10);
  return h < 11 ? 'Desayuno' : h < 13 ? 'Media mañana' : h < 16 ? 'Almuerzo' : h < 20 ? 'Merienda' : 'Cena';
};

interface Props {
  /** Para editar una comida ya apuntada. */
  initial?: DiaryEntry;
  /** Día de entreno: cambia las raciones del plan del dietista. */
  entreno: boolean;
  onSave: (e: Omit<DiaryEntry, 'id'>) => void;
  onCancel: () => void;
}

/**
 * Comida con varios ingredientes: se eligen productos ya escaneados (historial) con su cantidad y la
 * app suma calorías y macros.
 */
export default function MealBuilder({ initial, entreno, onSave, onCancel }: Props) {
  const [time, setTime] = useState(initial?.time ?? nowHHMM());
  const [name, setName] = useState(() => (initial && MEALS.includes(initial.name) ? initial.name : mealForTime(initial?.time ?? nowHHMM())));
  const [items, setItems] = useState<MealItem[]>(initial?.items ?? []);
  const [q, setQ] = useState('');
  const products = useMemo(() => loadHistory().map((h) => h.product), []);
  const past = useMemo(() => (initial ? [] : pastMeals(300)), [initial]);
  const [picked, setPicked] = useState('');
  /** Usa los datos actuales del producto (por si se corrigió después de apuntarlo). */
  const fresh = (p: Product): Product => products.find((x) => (p.code && x.code === p.code) || x.name === p.name) ?? p;
  const options = useMemo(() => {
    const list = past
      .filter((m) => m.name === name)
      .map((m, i) => {
        const fixed = m.items.map((it) => ({ ...it, product: fresh(it.product) }));
        const names = [...new Set(fixed.map((it) => it.product.name))].sort((a, b) => a.localeCompare(b, 'es'));
        return { key: String(i), meal: m, label: `${names.join(' + ')} · ${fmt(mealTotals(fixed).kcal, 0)} kcal` };
      });
    // Sin repetir etiquetas idénticas (misma comida apuntada varios días).
    const seen = new Set<string>();
    return list.filter((o) => (seen.has(o.label) ? false : (seen.add(o.label), true))).sort((a, b) => a.label.localeCompare(b.label, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [past, name, products]);

  const repeat = (m: PastMeal) => {
    setItems(m.items.map((i) => ({ ...i, product: fresh(i.product) })));
  };
  // Busca en tus productos escaneados y en la tabla de alimentos naturales (fruta, verdura…).
  const [extra, setExtra] = useState<Product[]>([]);
  const mine = useMemo(() => [...extra, ...products], [extra, products]);
  const matches = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return { mine: mine.slice(0, 5), foods: [] as Product[] };
    const words = t.split(/\s+/);
    const hit = (s: string) => words.every((w) => norm(s).includes(w));
    return {
      mine: mine.filter((p) => hit(`${p.name} ${p.brand ?? ''}`)).slice(0, 5),
      foods: FOODS.filter((f) => hit(`${f.name} ${f.aliases ?? ''}`)).slice(0, 8),
    };
  }, [q, mine]);
  const [creating, setCreating] = useState(false);
  const total = mealTotals(items);
  // Plan del dietista: raciones de esta comida, verdura limitada y raciones de fruta.
  const plan = useMemo(() => loadPlan(), []);
  const target = mealTarget(plan, name, entreno);
  const limited = items.filter((it) => vegRule(plan, it.product) === 'limitada');
  const limitedG = limited.reduce((a, it) => a + itemGrams(it), 0);

  const add = (p: Product) => {
    setItems([...items, { product: p, qty: p.unitWeight ? 1 : 100, unit: p.unitWeight ? 'unidad' : 'g' }]);
    setQ('');
  };
  const edit = (i: number, patch: Partial<MealItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  const save = () => {
    if (!items.length) return;
    onSave({ time, name, grams: null, items, ...total });
  };

  return (
    <div className="meal">
      <div className="grid-2 meal-head">
        <label className="field">
          <span>Comida</span>
          <select value={name} onChange={(e) => { setName(e.target.value); setPicked(''); }}>
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Hora</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {target && (
        <details className="plan-meal">
          <summary>
            <ClipboardList size={15} />
            <span><b>{target.titulo}</b> en tu plan: {target.raciones} raciones · {target.hc} g HC · {target.prot} g prot. · {target.grasa} g grasa</span>
          </summary>
          {target.day.nota && <p className="small muted">{target.day.nota}</p>}
          {target.day.grupos.map((g, k) => (
            <div key={k} className="plan-group">
              {g.grupo && <span className="plan-group-name">{g.grupo}</span>}
              <ul>{g.opciones.map((o) => <li key={o}>{o}</li>)}</ul>
            </div>
          ))}
        </details>
      )}

      {!initial && (
        <label className="field">
          <span><History size={12} style={{ verticalAlign: '-1px' }} /> Repetir {name.toLowerCase()} anterior</span>
          {options.length ? (
            <select value={picked} onChange={(e) => {
              setPicked(e.target.value);
              const o = options.find((x) => x.key === e.target.value);
              if (o) repeat(o.meal);
            }}>
              <option value="">Elige {FEM.has(name) ? 'una' : 'un'} {name.toLowerCase()} que ya hayas apuntado…</option>
              {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          ) : (
            <p className="small muted">Aún no has apuntado {FEM.has(name) ? 'ninguna' : 'ningún'} {name.toLowerCase()}. Cuando lo hagas, podrás {FEM.has(name) ? 'repetirla' : 'repetirlo'} desde aquí.</p>
          )}
        </label>
      )}

      {items.length > 0 && (
        <div className="meal-items">
          {items.map((it, i) => {
            const g = itemGrams(it);
            const t = forGrams(it.product.n, g);
            const u = it.product.liquid ? 'ml' : 'g';
            return (
              <div key={i} className="meal-item">
                <div className="meal-item-top">
                  <span className="meal-item-name">{it.product.name}{it.product.brand && <small>{it.product.brand}</small>}</span>
                  <button className="icon-btn" aria-label={`Quitar ${it.product.name}`} onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
                </div>
                <div className="meal-item-qty">
                  <QtyInput label={`Cantidad de ${it.product.name}`} value={it.qty} onChange={(qty) => {
                    // «150» con la unidad en «pepinos» sería 37 kg: se entiende que eran gramos.
                    if (it.unit === 'unidad' && it.product.unitWeight && qty >= 15 && qty * it.product.unitWeight > 1500) edit(i, { qty, unit: 'g' });
                    else edit(i, { qty });
                  }} />
                  {it.product.unitWeight ? (
                    <select aria-label="Unidad" value={it.unit} onChange={(e) => {
                      const unit = e.target.value as MealItem['unit'];
                      // Al cambiar de unidad se mantiene la misma cantidad real.
                      const qty = unit === 'g' ? Math.round(g) : Math.max(1, Math.round((g / it.product.unitWeight!) * 2) / 2);
                      edit(i, { unit, qty });
                    }}>
                      <option value="unidad">{it.qty === 1 ? it.product.unitName ?? 'unidad' : plural(it.product.unitName ?? 'unidad')}</option>
                      <option value="g">{u}</option>
                    </select>
                  ) : (
                    <span className="meal-unit">{u}</span>
                  )}
                  <span className="meal-item-kcal">{fmt(t.kcal, 0)} kcal</span>
                </div>
                <div className="meal-item-detail">
                  {it.unit === 'unidad' ? `${fmt(g, 0)} ${u} (1 ${it.product.unitName ?? 'unidad'} = ${fmt(it.product.unitWeight!, 1)} ${u})` : `${fmt(g, 0)} ${u}`}
                  {' · '}{fmt(it.product.n.kcal ?? 0, 0)} kcal por 100 {u}
                  {(() => {
                    const fr = fruitPortion(plan, it.product);
                    if (fr == null) return null;
                    const r = fruitRaciones(fr, g);
                    return <span className="plan-tag"> = {fmt(r, 1)} {r === 1 ? 'ración' : 'raciones'} de fruta</span>;
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="picker">
        <div className="with-icon">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={items.length ? 'Añadir otro alimento…' : 'Busca: galletas, patata, tomate…'} aria-label="Buscar producto" />
        </div>
        {(q || !items.length) && !creating && (
          matches.mine.length || matches.foods.length ? (
            <div className="picker-list">
              {matches.mine.length > 0 && <span className="picker-hint">{q ? 'Tus productos' : 'Últimos escaneados'}</span>}
              {matches.mine.map((p) => (
                <button key={(p.code ?? '') + p.name} onClick={() => add(p)}>
                  <span>{p.name}</span>
                  <small>{[p.brand, p.unitWeight ? `1 ${p.unitName ?? 'unidad'} = ${fmt(p.unitWeight, 1)} g` : null].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
              {matches.foods.length > 0 && <span className="picker-hint"><Leaf size={11} style={{ verticalAlign: '-1px' }} /> Alimentos naturales</span>}
              {matches.foods.map((p) => (
                <button key={p.code} onClick={() => add(p)}>
                  <span>{p.name}</span>
                  <small>{[`${fmt(p.n.kcal ?? 0, 0)} kcal por 100 g`, p.unitWeight ? `1 ${p.unitName} ≈ ${fmt(p.unitWeight, 0)} g` : null].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="small muted">{q ? 'No encuentro ese alimento entre tus productos ni en la tabla de alimentos naturales.' : 'Escribe el nombre de un producto escaneado o de un alimento natural (patata, tomate, plátano…).'}</p>
          )
        )}
        {q.trim().length >= 2 && !creating && (
          <button className="link" onClick={() => setCreating(true)}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Crear «{q.trim()}» con sus valores por 100 g</button>
        )}
        {creating && (
          <NewFood name={q.trim()} onCancel={() => setCreating(false)} onCreate={(p) => { addToHistory(p); setExtra([p, ...extra]); add(p); setCreating(false); }} />
        )}
      </div>

      {plan && limitedG > plan.verdura.limite && (
        <p className="note warn-note">
          Llevas {fmt(limitedG, 0)} g de {[...new Set(limited.map((it) => it.product.name.toLowerCase()))].join(', ')}. Tu dietista pone un máximo de {plan.verdura.limite} g por comida para estas verduras.
        </p>
      )}

      <div className="meal-total">
        <strong>{fmt(total.kcal, 0)} kcal</strong>
        {target ? (
          <div className="meal-vs">
            <VsPlan label="Hidratos" value={total.hc} goal={target.hc} />
            <VsPlan label="Proteína" value={total.prot} goal={target.prot} />
            <VsPlan label="Grasa" value={total.grasa} goal={target.grasa} />
          </div>
        ) : (
          <span>{fmt(total.prot, 1)} g proteína · {fmt(total.hc, 1)} g hidratos · {fmt(total.grasa, 1)} g grasa</span>
        )}
      </div>

      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary small-btn" disabled={!items.length} onClick={save}>{initial ? 'Guardar cambios' : 'Añadir al diario'}</button>
      </div>
    </div>
  );
}

/** Lo que lleva la comida frente a lo que marca el plan del dietista (±15 % se da por bueno). */
export function VsPlan({ label, value, goal }: { label: string; value: number; goal: number }) {
  const tone = goal <= 0 ? '' : value > goal * 1.15 ? 'high' : value >= goal * 0.85 ? 'ok' : 'muted';
  return (
    <span className={`vs ${tone}`}>
      <small>{label}</small>
      <b>{fmt(value, 0)}</b> / {fmt(goal, 0)} g
    </span>
  );
}

/** Campo de cantidad que deja escribir decimales con coma («1,5») sin perder el texto. */
function QtyInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => {
    if (num(text) !== value) setText(String(value).replace('.', ','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <input inputMode="decimal" aria-label={label} value={text} onChange={(e) => { setText(e.target.value); onChange(num(e.target.value)); }} />;
}

/** Alimento propio sin código de barras: nombre y valores por 100 g (de la etiqueta o de una tabla). */
function NewFood({ name, onCreate, onCancel }: { name: string; onCreate: (p: Product) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name, kcal: '', prot: '', hc: '', azucar: '', grasa: '', unit: '', unitName: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const ok = v.name.trim() && num(v.kcal) > 0;
  const field = (k: keyof typeof v, label: string, unit: string) => (
    <label className="field">
      <span>{label}</span>
      <div className="with-unit"><input inputMode="decimal" value={v[k]} onChange={set(k)} /><em>{unit}</em></div>
    </label>
  );
  const create = () => {
    const uw = num(v.unit);
    onCreate({
      code: `propio:${Date.now().toString(36)}`,
      name: v.name.trim(),
      brand: 'Alimento propio',
      n: { kcal: num(v.kcal), prot: num(v.prot), hc: num(v.hc), azucar: v.azucar ? num(v.azucar) : null, grasa: num(v.grasa), sat: null, fibra: null, sal: null },
      liquid: false,
      drink: false,
      unitWeight: uw > 0 ? uw : undefined,
      unitName: uw > 0 ? v.unitName.trim() || 'unidad' : undefined,
      source: 'manual',
    });
  };
  return (
    <div className="new-food">
      <label className="field"><span>Nombre</span><input value={v.name} onChange={set('name')} /></label>
      <p className="small muted">Valores por 100 g (de la etiqueta o de una tabla de alimentos).</p>
      <div className="grid-2">
        {field('kcal', 'Calorías', 'kcal')}
        {field('prot', 'Proteína', 'g')}
        {field('hc', 'Hidratos', 'g')}
        {field('azucar', 'Azúcares', 'g')}
        {field('grasa', 'Grasa', 'g')}
        {field('unit', 'Peso de 1 unidad (opcional)', 'g')}
      </div>
      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary small-btn" disabled={!ok} onClick={create}>Crear y añadir</button>
      </div>
    </div>
  );
}
