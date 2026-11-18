import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, Plus, Sofa, Trash2 } from 'lucide-react';
import type { Profile } from '../lib/profile.ts';
import type { Product } from '../lib/types.ts';
import { dowOf, type Today } from '../lib/training.ts';
import { addEntry, dayKey, loadDay, remaining, removeEntry, totals, updateEntry, forGrams, type DiaryEntry } from '../lib/diary.ts';
import { fmt, plural } from '../lib/evaluate.ts';

const num = (s: string) => {
  const t = s.replace(',', '.').trim();
  return t === '' || !isFinite(+t) ? 0 : +t;
};

interface Props {
  profile: Profile;
  hoy: Today;
  onOpen: (p: Product) => void;
  toast: (m: string) => void;
}

export default function DiaryPage({ profile, hoy, onOpen, toast }: Props) {
  const [date, setDate] = useState(() => new Date());
  const [version, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const key = dayKey(date);
  const isToday = key === dayKey();
  const entries = loadDay(key);
  void version;
  // Hoy manda el ajuste del día; otros días, la semana del perfil.
  const entreno = isToday ? hoy.entreno : (profile.semana ?? []).some((t) => t.dow === dowOf(date));
  const plan = entreno ? profile.entreno : profile.descanso;
  const t = totals(entries);
  const left = remaining(plan, t);
  const refresh = () => setVersion((v) => v + 1);
  const shift = (days: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    setDate(d);
    setAdding(false);
  };
  const label = isToday ? 'Hoy' : date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page narrow">
      <header className="page-head">
        <div>
          <h1>Diario</h1>
          <p>Lo que vas comiendo frente a tu plan del día.</p>
        </div>
      </header>

      <div className="day-nav">
        <button className="icon-btn" aria-label="Día anterior" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
        <div>
          <strong>{label}</strong>
          <span>{entreno ? <><Dumbbell size={13} /> Día de entreno</> : <><Sofa size={13} /> Día sin entreno</>} · {fmt(plan.kcal, 0)} kcal</span>
        </div>
        <button className="icon-btn" aria-label="Día siguiente" onClick={() => shift(1)} disabled={isToday}><ChevronRight size={20} /></button>
      </div>

      <section className="card">
        <div className="kcal-head">
          <div>
            <strong>{fmt(t.kcal, 0)}</strong> <span>/ {fmt(plan.kcal, 0)} kcal</span>
          </div>
          <span className={left.kcal < 0 ? 'over' : 'muted'}>
            {left.kcal >= 0 ? `Te quedan ${fmt(left.kcal, 0)} kcal` : `Te has pasado ${fmt(-left.kcal, 0)} kcal`}
          </span>
        </div>
        <Bar value={t.kcal} max={plan.kcal} big />
        <div className="macros">
          <Macro label="Proteína" value={t.prot} max={plan.prot} goal="reach" />
          <Macro label="Hidratos" value={t.hc} max={plan.hc} />
          <Macro label="Grasa" value={t.grasa} max={plan.grasa} />
        </div>
      </section>

      <section className="card">
        <div className="card-head-row">
          <h2 className="card-title">Comidas</h2>
          {!adding && <button className="link" onClick={() => setAdding(true)}><Plus size={14} style={{ verticalAlign: '-2px' }} /> Añadir a mano</button>}
        </div>
        {adding && <ManualEntry onCancel={() => setAdding(false)} onAdd={(e) => { addEntry(e, key); setAdding(false); refresh(); toast('Añadido al diario'); }} />}
        {entries.length ? (
          <div className="list">
            {entries.map((e) => <EntryRow key={e.id} e={e} day={key} onOpen={onOpen} onChange={refresh} />)}
          </div>
        ) : (
          !adding && <p className="empty">Aún no has apuntado nada {isToday ? 'hoy' : 'este día'}. Desde el resultado de un producto pulsa «Lo he comido», o añade a mano lo que no escaneas.</p>
        )}
      </section>
      <p className="small muted">Para que el total sea real, apunta también lo que comes sin escanear (las comidas del menú), con «Añadir a mano». La app usa lo que te queda para ajustar la cantidad máxima de cada producto.</p>
    </div>
  );
}

function Bar({ value, max, big }: { value: number; max: number; big?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`bar ${big ? 'big' : ''}`} aria-hidden>
      <span style={{ width: `${pct}%` }} className={value > max ? 'over' : ''} />
    </div>
  );
}

function Macro({ label, value, max, goal }: { label: string; value: number; max: number; goal?: 'reach' }) {
  const left = max - value;
  return (
    <div className="macro">
      <span className="macro-label">{label}</span>
      <Bar value={value} max={max} />
      <span className="macro-val"><b>{fmt(value, 0)}</b> / {fmt(max, 0)} g</span>
      <small className={left < 0 && goal !== 'reach' ? 'over' : 'muted'}>
        {left >= 0 ? `faltan ${fmt(left, 0)} g` : goal === 'reach' ? 'objetivo cumplido' : `+${fmt(-left, 0)} g`}
      </small>
    </div>
  );
}

function EntryRow({ e, day, onOpen, onChange }: { e: DiaryEntry; day: string; onOpen: (p: Product) => void; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(e.units ?? e.grams ?? ''));
  const qtyText = e.units != null ? `${fmt(e.units, 1)} ${e.units === 1 ? e.unitName : plural(e.unitName ?? 'unidad')}` : e.grams != null ? `${fmt(e.grams, 0)} ${e.product?.liquid ? 'ml' : 'g'}` : '';

  const save = () => {
    const q = num(qty);
    if (q <= 0 || !e.product) return setEditing(false);
    const grams = e.units != null && e.product.unitWeight ? q * e.product.unitWeight : q;
    updateEntry(e.id, { grams, units: e.units != null ? q : undefined, ...forGrams(e.product.n, grams) }, day);
    setEditing(false);
    onChange();
  };

  return (
    <div className="list-item entry">
      <span className="entry-time">{e.time}</span>
      <button className="entry-main" onClick={() => (e.product ? (e.grams != null ? setEditing(!editing) : onOpen(e.product)) : undefined)}>
        <span className="list-name">{e.name}<small>{[qtyText, `${fmt(e.kcal, 0)} kcal`, `${fmt(e.prot, 0)} g prot.`].filter(Boolean).join(' · ')}</small></span>
      </button>
      {editing && (
        <div className="entry-edit">
          <div className="with-unit">
            <input inputMode="decimal" value={qty} onChange={(ev) => setQty(ev.target.value)} aria-label="Cantidad" />
            <em>{e.units != null ? plural(e.unitName ?? 'unidad') : e.product?.liquid ? 'ml' : 'g'}</em>
          </div>
          <button className="btn primary small-btn" onClick={save}>Guardar</button>
          {e.product && <button className="btn ghost small-btn" onClick={() => onOpen(e.product!)}>Ver producto</button>}
        </div>
      )}
      <button className="icon-btn" aria-label={`Borrar ${e.name}`} onClick={() => { removeEntry(e.id, day); onChange(); }}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ManualEntry({ onAdd, onCancel }: { onAdd: (e: Omit<DiaryEntry, 'id' | 'time'>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: '', kcal: '', prot: '', hc: '', grasa: '' });
  const set = (k: keyof typeof v) => (ev: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: ev.target.value });
  const ok = v.name.trim() && num(v.kcal) > 0;
  return (
    <div className="cita-editor">
      <label className="field"><span>Qué has comido</span><input value={v.name} onChange={set('name')} placeholder="Comida del menú: pollo con arroz" /></label>
      <div className="grid-2">
        <label className="field"><span>Calorías</span><div className="with-unit"><input inputMode="decimal" value={v.kcal} onChange={set('kcal')} /><em>kcal</em></div></label>
        <label className="field"><span>Proteína</span><div className="with-unit"><input inputMode="decimal" value={v.prot} onChange={set('prot')} /><em>g</em></div></label>
        <label className="field"><span>Hidratos</span><div className="with-unit"><input inputMode="decimal" value={v.hc} onChange={set('hc')} /><em>g</em></div></label>
        <label className="field"><span>Grasa</span><div className="with-unit"><input inputMode="decimal" value={v.grasa} onChange={set('grasa')} /><em>g</em></div></label>
      </div>
      <div className="cita-actions">
        <button className="btn ghost small-btn" onClick={onCancel}>Cancelar</button>
        <button className="btn primary small-btn" disabled={!ok} onClick={() => onAdd({ name: v.name.trim(), grams: null, kcal: num(v.kcal), prot: num(v.prot), hc: num(v.hc), grasa: num(v.grasa) })}>Añadir</button>
      </div>
    </div>
  );
}
