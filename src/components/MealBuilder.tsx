import { useEffect, useMemo, useState } from 'react';
import { History, Search, Trash2 } from 'lucide-react';
import type { Product } from '../lib/types.ts';
import { loadHistory } from '../lib/storage.ts';
import { dayKey, forGrams, itemGrams, mealTotals, pastMeals, type DiaryEntry, type MealItem, type PastMeal } from '../lib/diary.ts';
import { fmt, plural } from '../lib/evaluate.ts';

const MEALS = ['Desayuno', 'Media mañana', 'Almuerzo', 'Merienda', 'Cena'];
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
  onSave: (e: Omit<DiaryEntry, 'id'>) => void;
  onCancel: () => void;
}

/**
 * Comida con varios ingredientes: se eligen productos ya escaneados (historial) con su cantidad y la
 * app suma calorías y macros.
 */
export default function MealBuilder({ initial, onSave, onCancel }: Props) {
  const [time, setTime] = useState(initial?.time ?? nowHHMM());
  const [name, setName] = useState(() => (initial && MEALS.includes(initial.name) ? initial.name : mealForTime(initial?.time ?? nowHHMM())));
  const [items, setItems] = useState<MealItem[]>(initial?.items ?? []);
  const [q, setQ] = useState('');
  const products = useMemo(() => loadHistory().map((h) => h.product), []);
  const past = useMemo(() => (initial ? [] : pastMeals()), [initial]);
  // Primero las comidas anteriores del mismo tipo (otro desayuno si estás apuntando el desayuno).
  const suggestions = useMemo(() => {
    const same = past.filter((m) => m.name === name);
    return (same.length ? same : past).slice(0, 4);
  }, [past, name]);

  /** Usa los datos actuales del producto (por si se corrigió después de apuntarlo). */
  const fresh = (p: Product): Product => products.find((x) => (p.code && x.code === p.code) || x.name === p.name) ?? p;
  const repeat = (m: PastMeal) => {
    setItems(m.items.map((i) => ({ ...i, product: fresh(i.product) })));
    if (MEALS.includes(m.name)) setName(m.name);
  };
  const matches = useMemo(() => {
    const t = norm(q.trim());
    const list = t ? products.filter((p) => norm(`${p.name} ${p.brand ?? ''}`).includes(t)) : products;
    return list.slice(0, t ? 8 : 5);
  }, [q, products]);
  const total = mealTotals(items);

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
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Hora</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>

      {!items.length && suggestions.length > 0 && (
        <div className="past">
          <span className="picker-hint"><History size={12} style={{ verticalAlign: '-1px' }} /> Repetir una comida anterior</span>
          {suggestions.map((m) => (
            <button key={`${m.day}-${m.time}`} className="past-meal" onClick={() => repeat(m)}>
              <span className="past-top"><b>{m.name}</b><small>{dayLabel(m.day)} · {fmt(mealTotals(m.items.map((i) => ({ ...i, product: fresh(i.product) }))).kcal, 0)} kcal</small></span>
              <small>{m.items.map((i) => `${i.unit === 'unidad' ? `${fmt(i.qty, 1)} ${i.qty === 1 ? i.product.unitName ?? 'unidad' : plural(i.product.unitName ?? 'unidad')}` : `${fmt(i.qty, 0)} ${i.product.liquid ? 'ml' : 'g'}`} ${i.product.name}`).join(' + ')}</small>
            </button>
          ))}
          <span className="picker-hint">O elige los productos uno a uno</span>
        </div>
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
                  <QtyInput label={`Cantidad de ${it.product.name}`} value={it.qty} onChange={(qty) => edit(i, { qty })} />
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="picker">
        <div className="with-icon">
          <Search size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={items.length ? 'Añadir otro producto…' : 'Busca un producto escaneado…'} aria-label="Buscar producto" />
        </div>
        {(q || !items.length) && (
          matches.length ? (
            <div className="picker-list">
              {!q && <span className="picker-hint">Últimos escaneados</span>}
              {matches.map((p) => (
                <button key={(p.code ?? '') + p.name} onClick={() => add(p)}>
                  <span>{p.name}</span>
                  <small>{[p.brand, p.unitWeight ? `1 ${p.unitName ?? 'unidad'} = ${fmt(p.unitWeight, 1)} g` : null].filter(Boolean).join(' · ')}</small>
                </button>
              ))}
            </div>
          ) : (
            <p className="small muted">{products.length ? 'No hay ningún producto con ese nombre en tu historial.' : 'Aún no has escaneado productos.'} Escanéalo primero desde Escanear y luego vuelve aquí.</p>
          )
        )}
      </div>

      <div className="meal-total">
        <strong>{fmt(total.kcal, 0)} kcal</strong>
        <span>{fmt(total.prot, 1)} g proteína · {fmt(total.hc, 1)} g hidratos · {fmt(total.grasa, 1)} g grasa</span>
      </div>

      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary small-btn" disabled={!items.length} onClick={save}>{initial ? 'Guardar cambios' : 'Añadir al diario'}</button>
      </div>
    </div>
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

function dayLabel(day: string): string {
  const today = dayKey();
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (day === today) return 'hoy';
  if (day === dayKey(y)) return 'ayer';
  return new Date(day + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}
